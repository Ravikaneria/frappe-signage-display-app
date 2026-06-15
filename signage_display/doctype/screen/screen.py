import uuid
import frappe
from frappe.model.document import Document


class Screen(Document):

    def before_insert(self):
        # Generate a short unique token if not already set
        if not self.screen_id:
            self.screen_id = uuid.uuid4().hex[:12].upper()  # e.g. "A3F9C2B1D4E7"

    def after_insert(self):
        self._refresh_display_url()

    def on_update(self):
        self._refresh_display_url()

    def _refresh_display_url(self):
        site_url = frappe.utils.get_url()
        url = f"{site_url}/display/{self.screen_id}"
        if self.display_url != url:
            frappe.db.set_value("Screen", self.name, "display_url", url, update_modified=False)


# ─────────────────────────────────────────────────────────────────────────────
# Scheduled job — called every minute by the Frappe scheduler
# Any screen that hasn't sent a heartbeat in the last 90 seconds → offline
# ─────────────────────────────────────────────────────────────────────────────
def mark_screens_offline():
    cutoff = frappe.utils.add_to_date(frappe.utils.now_datetime(), seconds=-90)
    frappe.db.sql(
        """
        UPDATE `tabScreen`
        SET is_live = 0
        WHERE is_live = 1
          AND (last_seen IS NULL OR last_seen < %s)
        """,
        (cutoff,),
    )
    frappe.db.commit()


# ─────────────────────────────────────────────────────────────────────────────
# Bulk-generate Screen records (called from ERPNext UI button)
# ─────────────────────────────────────────────────────────────────────────────
@frappe.whitelist()
def generate_screens(count=50, prefix="Screen"):
    """
    Creates Screen records numbered Screen-01 ... Screen-<count>.
    Skips any that already exist. Maximum 50 screens.
    """
    count = min(int(count), 50)
    created = []

    for i in range(1, count + 1):
        name = f"{prefix}-{str(i).zfill(2)}"
        if frappe.db.exists("Screen", {"screen_name": name}):
            continue

        doc = frappe.new_doc("Screen")
        doc.screen_name = name
        doc.is_active = 1
        doc.insert(ignore_permissions=True)
        created.append({
            "name": doc.name,
            "screen_id": doc.screen_id,
            "screen_name": doc.screen_name,
            "display_url": doc.display_url,
        })

    frappe.db.commit()
    return {"created": len(created), "screens": created}
