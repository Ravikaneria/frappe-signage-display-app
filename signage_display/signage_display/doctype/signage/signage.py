import re
import frappe
from frappe.model.document import Document

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

    def _handle_youtube(self):
        if self.content_type != "YouTube":
            self.youtube_embed_url = ""
            return
        vid_id = _extract_yt_id(self.youtube_url)
        if not vid_id:
            frappe.throw(
                "Invalid YouTube URL. Use a link like: "
                "https://www.youtube.com/watch?v=XXXXXXXXXXX"
            )
        self.youtube_embed_url = (
            f"https://www.youtube.com/embed/{vid_id}"
            f"?autoplay=1&mute=1&loop=1&playlist={vid_id}"
            f"&controls=0&modestbranding=1&rel=0&enablejsapi=1"
        )

    def _auto_resize_image(self):
        if self.content_type not in ("Image", None, "") or not self.display_image:
            return
        MAX_W, MAX_H = 1920, 1080
        try:
            from PIL import Image as PILImage
            import os
            file_doc = frappe.db.get_value(
                "File", {"file_url": self.display_image}, ["name"], as_dict=True
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
                    return
                img = img.copy()
                img.thumbnail((MAX_W, MAX_H), PILImage.LANCZOS)
                fmt = img.format or "JPEG"
                save_kwargs = {}
                if fmt in ("JPEG", "JPG"):
                    save_kwargs = {"quality": 88, "optimize": True}
                elif fmt == "PNG":
                    save_kwargs = {"optimize": True}
                img.save(abs_path, format=fmt, **save_kwargs)
            frappe.msgprint(
                f"Image resized from {orig_w}x{orig_h} to {img.size[0]}x{img.size[1]}",
                indicator="green", alert=True,
            )
        except ImportError:
            frappe.log_error("Pillow not installed — image resize skipped", "Signage")
        except Exception as exc:
            frappe.log_error(f"Image resize error: {exc}", "Signage Image Resize")

    def on_update(self):
        pass

    def after_delete(self):
        pass


@frappe.whitelist(allow_guest=True)
def get_all_signages():
    """Returns all published signages. Called by display.js every 30s."""
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
        if item.get("display_image"):
            item["display_image"] = site_url + item["display_image"]
        if item.get("video_file"):
            item["video_file"] = site_url + item["video_file"]
        result.append(item)
    return result


@frappe.whitelist(allow_guest=True)
def get_signages_for_screen(screen_id):
    """Returns published signages for a specific screen. Records heartbeat."""
    screen = frappe.db.get_value(
        "Screen",
        {"screen_id": screen_id, "is_active": 1},
        ["name", "screen_name"],
        as_dict=True,
    )
    if not screen:
        frappe.throw(f"Screen '{screen_id}' not found or inactive", frappe.DoesNotExistError)
    _record_heartbeat(screen_id)
    return get_all_signages()


@frappe.whitelist(allow_guest=True)
def screen_heartbeat(screen_id):
    """Called every 30s by the player to mark the screen as Live Now."""
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
