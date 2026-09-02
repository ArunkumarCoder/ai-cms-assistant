import {defineField, defineType} from 'sanity'

export const seo = defineType({
  name: 'seo',
  title: 'SEO',
  type: 'object',
  fields: [
    defineField({
      name: 'metaTitle',
      title: 'Meta title',
      type: 'string',
      description:
        'Overrides the page title in search results and browser tabs. Falls back to the page title if left blank.',
      validation: (Rule) => Rule.max(60).warning('Longer titles get truncated in search results.'),
    }),
    defineField({
      name: 'metaDescription',
      title: 'Meta description',
      type: 'text',
      rows: 3,
      validation: (Rule) =>
        Rule.max(160).warning('Longer descriptions get truncated in search results.'),
    }),
  ],
})
