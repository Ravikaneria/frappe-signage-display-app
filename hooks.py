app_name = "signage_display"
app_title = "Signage Display"
app_publisher = "Highflyer Global Innovations"
app_description = "Display Signage Boards"
app_email = "hello@hfgi.co.uk"
app_license = "MIT"
app_version = "0.0.2"

# ─────────────────────────────────────────────────────────────────────────────
# Website routing
#
# /display          → www/display.html (all screens, legacy URL)
# /display/<id>     → www/display.html (screen-specific, screen_id injected)
#
# Frappe resolves this via website_route_rules. The path after /display is
# passed to get_context() as frappe.form_dict["path"].
# ─────────────────────────────────────────────────────────────────────────────
website_route_rules = [
    {"from_route": "/display/<path:screen_id>", "to_route": "display"},
]

# ─────────────────────────────────────────────────────────────────────────────
# Scheduled Tasks
#
# mark_screens_offline: runs every minute.
# Any Screen with no heartbeat for >90 s is marked is_live = 0.
# ─────────────────────────────────────────────────────────────────────────────
scheduler_events = {
    "all": [
        "signage_display.signage_display.doctype.screen.screen.mark_screens_offline"
    ]
}

# ─────────────────────────────────────────────────────────────────────────────
# User Data Protection
# ─────────────────────────────────────────────────────────────────────────────
# user_data_fields = []
