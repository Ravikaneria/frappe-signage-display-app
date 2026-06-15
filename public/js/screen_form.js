// Client Script
// DocType: Screen  |  Type: Form

frappe.ui.form.on("Screen", {

    refresh: function (frm) {

        // ── Live / Offline banner ────────────────────────────────────────────
        if (frm.doc.is_live) {
            const since = frm.doc.last_seen
                ? " · Last seen: " + frappe.datetime.prettyDate(frm.doc.last_seen)
                : "";
            frm.dashboard.set_headline_alert(
                `<span style="color:green;font-weight:bold;">🟢 Live Now${since}</span>`
            );
        } else if (frm.doc.last_seen) {
            frm.dashboard.set_headline_alert(
                `<span style="color:#888;">⚫ Offline · Last seen: ${frappe.datetime.prettyDate(frm.doc.last_seen)}</span>`
            );
        }

        // ── Action buttons ───────────────────────────────────────────────────
        if (frm.doc.display_url) {
            frm.add_custom_button(__("Open Display"), function () {
                window.open(frm.doc.display_url, "_blank");
            }, __("Actions"));

            frm.add_custom_button(__("Copy URL"), function () {
                navigator.clipboard.writeText(frm.doc.display_url).then(() => {
                    frappe.show_alert({ message: __("URL copied!"), indicator: "green" });
                });
            }, __("Actions"));
        }
    },
});
