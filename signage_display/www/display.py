import frappe

# This runs server-side for every page load of /display
# It passes signage data and settings into the Jinja template context.
# NOTE: get_context() is the standard Frappe www page hook — no changes needed
#       for v15 compatibility in Python. All breaking changes were in the HTML/JS.

def get_context(context):
    # Suppress the breadcrumb / navbar that Frappe v15 injects on web pages
    context.no_cache = 1
    context.show_sidebar = False

    settings = frappe.get_doc("Signage Settings")
    context.signage_settings = settings

    context.signages = frappe.db.get_list(
        "Signage",
        filters={"published": "1"},
        fields=["title", "description", "display_image", "show_title"],
    )

    # Height per slide row as a percentage of the viewport
    context.signage_height = 80 // (settings.row_count or 1)

    # Pass the CSRF token so the JS can authenticate API calls via fetch()
    # (frappe.session is available server-side in www page context)
    context.csrf_token = frappe.session.csrf_token

    return context
