// Client Script
// DocType: Screen  |  Type: List
// Path in app: signage_display/public/js/screen_list.js
// Register via: hooks.py → doctype_list_js  OR  paste directly in Custom Script

frappe.listview_settings["Screen"] = {

    add_fields: ["is_live", "last_seen", "screen_name", "display_url", "is_active"],

    // Colour-coded status badges in list view
    get_indicator: function (doc) {
        if (!doc.is_active) return [__("Inactive"), "red",   "is_active,=,0"];
        if (doc.is_live)    return [__("Live"),     "green", "is_live,=,1"];
        return                     [__("Offline"),  "grey",  "is_live,=,0"];
    },

    onload: function (listview) {

        // ── Button: Generate 50 Screens ─────────────────────────────────────
        listview.page.add_action_item(__("Generate 50 Screens"), function () {
            frappe.confirm(
                __(
                    "This will create up to 50 Screen records (Screen-01 … Screen-50). " +
                    "Existing screens are skipped. Proceed?"
                ),
                function () {
                    frappe.call({
                        method: "signage_display.signage_display.doctype.screen.screen.generate_screens",
                        args: { count: 50, prefix: "Screen" },
                        freeze: true,
                        freeze_message: __("Generating screens…"),
                        callback: function (r) {
                            if (r.message) {
                                frappe.msgprint({
                                    title: __("Done"),
                                    indicator: "green",
                                    message: __("Created {0} new screen(s).", [r.message.created]),
                                });
                                listview.refresh();
                            }
                        },
                    });
                }
            );
        });

        // ── Button: Copy selected Display URLs ───────────────────────────────
        listview.page.add_action_item(__("Copy Selected URLs"), function () {
            const selected = listview.get_checked_items();
            if (!selected.length) {
                frappe.show_alert({ message: __("Select at least one row first."), indicator: "orange" });
                return;
            }
            const text = selected
                .map(d => `${d.screen_name}: ${d.display_url}`)
                .join("\n");
            navigator.clipboard.writeText(text).then(() => {
                frappe.show_alert({
                    message: __("Copied {0} URL(s) to clipboard.", [selected.length]),
                    indicator: "green",
                });
            });
        });
    },
};
