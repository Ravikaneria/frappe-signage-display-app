# Copyright (c) 2023, Highflyer Global Innovations and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class Signage(Document):

    def on_update(self):
        # frappe.publish_realtime is removed here.
        #
        # In the original code, on_update pushed updated signages to connected
        # clients via Socket.IO (frappe.realtime). This worked when the display
        # page was treated as a Desk page.
        #
        # In Frappe v15, frappe.realtime / Socket.IO is NOT available on public
        # /www pages for Guest users. The display.js now uses setInterval
        # polling (every 30 s) to pick up changes — no server push needed.
        #
        # If you later add authentication and serve the display inside the Desk,
        # you can re-add frappe.publish_realtime here.
        pass

    def after_delete(self):
        # Same reasoning as on_update above.
        pass


@frappe.whitelist(allow_guest=True)
def get_all_signages():
    """
    Returns all published signages.
    Called by display.js via fetch() every POLL_INTERVAL_MS milliseconds.
    allow_guest=True is required because /display is a public, unauthenticated page.
    """
    signages = frappe.db.get_list(
        "Signage",
        filters={"published": "1"},
        fields=["title", "description", "display_image", "show_title"],
    )
    return signages
