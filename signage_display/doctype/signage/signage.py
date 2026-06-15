import re
import frappe
from frappe.model.document import Document

# Matches all common YouTube URL formats
_YT_RE = re.compile(
    r"(?:youtube\.com/watch\?v=|youtu\.be/|youtube\.com/embed/|youtube\.com/shorts/)"
    r"([A-Za-z0-9_-]{11})"
)


def _extract_yt_id(url):
    m = _YT_RE.search(url or "")
    return m.group(1) if m else None


class Signage(Document):

    def validate(self):
        self._handle_youtube()
        self._auto_resize_image()

    # ── YouTube URL → embed URL ───────────────────────────────────────────────
    def _handle_youtube(self):
        if self.content_type != "YouTube":
            self.youtube_embed_url = ""
            return

        vid_id = _extract_yt_id(self.youtube_url)
        if not vid_id:
            frappe.throw(
                "Invalid YouTube URL — please paste a link like "
                "https://www.youtube.com/watch?v=XXXXXXXXXXX or https://youtu.be/XXXXXXXXXXX"
            )

        # autoplay + mute (required for autoplay in Chrome) + loop + no controls
        self.youtube_embed_url = (
            f"https://www.youtube.com/embed/{vid_id}"
            f"?autoplay=1&mute=1&loop=1&playlist={vid_id}"
            f"&controls=0&modestbranding=1&rel=0&enablejsapi=1"
        )

    # ── Auto-resize image to max 1920×1080 ───────────────────────────────────
    def _auto_resize_image(self):
        if self.content_type not in ("Image", None, "") or not self.display_image:
            return

        MAX_W, MAX_H = 1920, 1080

        try:
            from PIL import Image as PILImage
            import os

            # Look up the File doc to get the absolute path
            file_doc = frappe.db.get_value(
                "File", {"file_url": self.display_image}, ["name", "file_url"], as_dict=True
            )
            if not file_doc:
                return

            file_obj = frappe.get_doc("File", file_doc.name)
            abs_path = file_obj.get_full_path()

            if not os.path.exists(abs_path):
                return

            with PILImage.open(abs_path) as img:
                orig_w, orig_h = img.size
                if orig_w <= MAX_W and orig_h <= MAX_H:
                    return  # Already within limits — nothing to do

                img = img.copy()
                img.thumbnail((MAX_W, MAX_H), PILImage.LANCZOS)

                # Preserve format; fallback to JPEG for unknowns
                fmt = img.format or "JPEG"
                save_kwargs = {}
                if fmt in ("JPEG", "JPG"):
                    save_kwargs = {"quality": 88, "optimize": True}
                elif fmt == "PNG":
                    save_kwargs = {"optimize": True}

                img.save(abs_path, format=fmt, **save_kwargs)

            frappe.msgprint(
                f"Image resized from {orig_w}×{orig_h} → {img.size[0]}×{img.size[1]}",
                indicator="green",
                alert=True,
            )

        except ImportError:
            frappe.log_error("Pillow not installed — image auto-resize skipped", "Signage")
        except Exception as exc:
            # Non-fatal: log and continue saving
            frappe.log_error(f"Image resize error: {exc}", "Signage Image Resize")

    def on_update(self):
        # frappe.publish_realtime removed (not available on public /www pages in v15).
        # display.js uses setInterval polling instead.
        pass

    def after_delete(self):
        pass


# ── API endpoint ─────────────────────────────────────────────────────────────

@frappe.whitelist(allow_guest=True)
def get_all_signages():
    """
    Returns all published signages with full content metadata.
    Called by display.js every 30 s via fetch().
    Also called by screen-specific display pages (/display/<screen_id>).
    """
    site_url = frappe.utils.get_url()

    rows = frappe.db.get_list(
        "Signage",
        filters={"published": 1},
        fields=[
            "title", "description", "show_title",
            "content_type", "display_duration",
            "display_image", "video_file", "youtube_embed_url",
        ],
    )

    result = []
    for r in rows:
        item = dict(r)
        # Make image / video URLs absolute so the player can load them
        if item.get("display_image"):
            item["display_image"] = site_url + item["display_image"]
        if item.get("video_file"):
            item["video_file"] = site_url + item["video_file"]
        # display_duration: 0 means "use global setting" — player handles that
        result.append(item)

    return result


@frappe.whitelist(allow_guest=True)
def get_signages_for_screen(screen_id):
    """
    Returns published signages filtered by a Screen record.
    If the Screen has no playlist filter, returns all published signages.
    Called by screen-specific player pages: /display/<screen_id>
    """
    # Look up the Screen record
    screen = frappe.db.get_value(
        "Screen",
        {"screen_id": screen_id, "is_active": 1},
        ["name", "screen_name"],
        as_dict=True,
    )

    if not screen:
        frappe.throw(f"Screen '{screen_id}' not found or inactive", frappe.DoesNotExistError)

    # Record heartbeat — mark as live
    _record_heartbeat(screen_id)

    # For now, all screens show all published signages.
    # Future: add a "Playlist" link on Screen and filter here.
    return get_all_signages()


@frappe.whitelist(allow_guest=True)
def screen_heartbeat(screen_id):
    """
    Called every 30 s by an active player page to signal it is live.
    Updates Screen.is_live and Screen.last_seen.
    """
    _record_heartbeat(screen_id)
    return {"status": "ok"}


def _record_heartbeat(screen_id):
    name = frappe.db.get_value("Screen", {"screen_id": screen_id}, "name")
    if not name:
        return
    frappe.db.set_value(
        "Screen", name,
        {"is_live": 1, "last_seen": frappe.utils.now_datetime()},
        update_modified=False,
    )
    frappe.db.commit()
