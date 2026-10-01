<?php
/**
 * Plugin Name: AI CMS Assistant — Content Model
 * Description: Registers the ai_cms_page custom post type, the in_review/
 * approved custom statuses, and the custom meta fields WordPressAdapter
 * reads and writes. This is the WordPress-side half of the mapping decided
 * in SPEC.md §22/§23 — kept in version control the same way
 * studio/schemaTypes/ versions Sanity's schema. Deploy by copying this file
 * into wp-content/mu-plugins/ on the target WordPress install (mu-plugins
 * load automatically, no activation step).
 */

if (!defined('ABSPATH')) {
    exit;
}

add_action('init', function () {
    register_post_type('ai_cms_page', [
        'labels' => [
            'name' => 'AI CMS Pages',
            'singular_name' => 'AI CMS Page',
        ],
        'public' => true,
        'show_ui' => true,
        'show_in_rest' => true,
        'rest_base' => 'ai-cms-pages',
        // 'custom-fields' is required for register_post_meta() values to be
        // editable through the block editor's own UI, not just the REST API.
        'supports' => ['title', 'editor', 'author', 'custom-fields', 'revisions'],
        'map_meta_cap' => true,
        'has_archive' => false,
    ]);

    // Sit between WordPress's native draft/publish so PageStatus (draft |
    // in-review | approved | published, SPEC.md §17) has a WP-side home.
    // 'internal' => false and 'public' => true are both required for the
    // REST posts controller to accept these as a ?status= query value for
    // an authenticated request — leaving either at its default hides them
    // from /wp/v2/ai-cms-pages exactly like the undocumented publish-only
    // default the Day 26 gotcha already flagged.
    register_post_status('in_review', [
        'label' => _x('In Review', 'post status'),
        'public' => true,
        'internal' => false,
        'exclude_from_search' => true,
        'show_in_admin_all_list' => true,
        'show_in_admin_status_list' => true,
        'label_count' => _n_noop(
            'In Review <span class="count">(%s)</span>',
            'In Review <span class="count">(%s)</span>'
        ),
    ]);

    register_post_status('approved', [
        'label' => _x('Approved', 'post status'),
        'public' => true,
        'internal' => false,
        'exclude_from_search' => true,
        'show_in_admin_all_list' => true,
        'show_in_admin_status_list' => true,
        'label_count' => _n_noop(
            'Approved <span class="count">(%s)</span>',
            'Approved <span class="count">(%s)</span>'
        ),
    ]);

    $auth_edit = ['auth_callback' => fn () => current_user_can('edit_posts')];

    // PageType (landing | blog | service | other, SPEC.md §4) is a required
    // field on the domain Page type with no WordPress-native equivalent —
    // WP's own post-type/taxonomy system models a different axis (content
    // structure, not page purpose). Defaults to "other" in the adapter when
    // this meta is empty, same convention as quality score's empty-string-
    // means-unset below.
    register_post_meta('ai_cms_page', '_ai_cms_page_type', [
        'type' => 'string',
        'single' => true,
        'show_in_rest' => true,
        ...$auth_edit,
    ]);

    register_post_meta('ai_cms_page', '_ai_cms_target_keyword', [
        'type' => 'string',
        'single' => true,
        'show_in_rest' => true,
        ...$auth_edit,
    ]);

    // Quality score is stored as a numeric STRING, not an integer, on
    // purpose: WordPress's REST meta layer returns a registered key's empty
    // value (0 for 'integer') when a page has never been scored, which is
    // indistinguishable from a real score of 0. An empty string has no such
    // collision, so "never scored" (empty string -> null) and "scored zero"
    // stay distinguishable. See wordpressAdapter.ts's toPage().
    register_post_meta('ai_cms_page', '_ai_cms_quality_score', [
        'type' => 'string',
        'single' => true,
        'show_in_rest' => true,
        ...$auth_edit,
    ]);

    register_post_meta('ai_cms_page', '_ai_cms_seo_meta_title', [
        'type' => 'string',
        'single' => true,
        'show_in_rest' => true,
        ...$auth_edit,
    ]);

    register_post_meta('ai_cms_page', '_ai_cms_seo_meta_description', [
        'type' => 'string',
        'single' => true,
        'show_in_rest' => true,
        ...$auth_edit,
    ]);

    // JSON-encoded FaqItem[] (SPEC.md §22 gap analysis) — WordPress has no
    // native repeater field outside ACF, and this project deliberately
    // isn't taking the ACF dependency for a single field.
    register_post_meta('ai_cms_page', '_ai_cms_faq_items', [
        'type' => 'string',
        'single' => true,
        'show_in_rest' => true,
        ...$auth_edit,
    ]);
});
