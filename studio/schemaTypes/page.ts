import {defineArrayMember, defineField, defineType} from 'sanity'
import {DocumentIcon} from '@sanity/icons/Document'

export const page = defineType({
  name: 'page',
  title: 'Page',
  type: 'document',
  icon: DocumentIcon,
  groups: [
    {name: 'content', title: 'Content', default: true},
    {name: 'seo', title: 'SEO & quality'},
    {name: 'faqs', title: 'FAQs'},
  ],
  fields: [
    defineField({
      name: 'title',
      type: 'string',
      group: 'content',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'slug',
      type: 'slug',
      group: 'content',
      options: {source: 'title', maxLength: 96},
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'pageType',
      title: 'Page type',
      type: 'string',
      group: 'content',
      options: {
        list: [
          {title: 'Landing page', value: 'landing'},
          {title: 'Blog post', value: 'blog'},
          {title: 'Service page', value: 'service'},
          {title: 'Other', value: 'other'},
        ],
        layout: 'radio',
      },
      initialValue: 'other',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'status',
      type: 'string',
      group: 'content',
      options: {
        list: [
          {title: 'Draft', value: 'draft'},
          {title: 'In review', value: 'in-review'},
          {title: 'Published', value: 'published'},
        ],
        layout: 'radio',
      },
      initialValue: 'draft',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'targetKeyword',
      title: 'Target keyword',
      type: 'string',
      group: 'content',
      description: 'Primary SEO keyword this page targets.',
    }),
    defineField({
      name: 'body',
      title: 'Body',
      type: 'array',
      group: 'content',
      of: [
        defineArrayMember({
          type: 'block',
          styles: [
            {title: 'Normal', value: 'normal'},
            {title: 'Heading 2', value: 'h2'},
            {title: 'Heading 3', value: 'h3'},
            {title: 'Heading 4', value: 'h4'},
            {title: 'Quote', value: 'blockquote'},
          ],
        }),
        defineArrayMember({
          type: 'image',
          name: 'imageBlock',
          title: 'Image',
          options: {hotspot: true},
          fields: [
            defineField({
              name: 'alt',
              title: 'Alternative text',
              type: 'string',
              validation: (Rule) =>
                Rule.required().warning('Alt text is important for accessibility and SEO.'),
            }),
            defineField({
              name: 'altTextStatus',
              title: 'Alt text status',
              type: 'string',
              options: {
                list: [
                  {title: 'Missing', value: 'missing'},
                  {title: 'AI-generated', value: 'ai-generated'},
                  {title: 'Reviewed', value: 'reviewed'},
                ],
                layout: 'radio',
              },
              initialValue: 'missing',
            }),
            defineField({name: 'caption', type: 'string'}),
          ],
        }),
        defineArrayMember({type: 'ctaBlock'}),
      ],
      validation: (Rule) => Rule.required().min(1),
    }),
    defineField({
      name: 'seo',
      title: 'SEO',
      type: 'seo',
      group: 'seo',
    }),
    defineField({
      name: 'qualityScore',
      title: 'Quality score',
      type: 'number',
      group: 'seo',
      description:
        '0-100 score from the most recent SEO/quality audit. Set by the AI SEO-audit call, not maintained by hand.',
      validation: (Rule) => Rule.min(0).max(100),
    }),
    defineField({
      name: 'faqItems',
      title: 'FAQ items',
      type: 'array',
      group: 'faqs',
      of: [defineArrayMember({type: 'faqItem'})],
    }),
  ],
  preview: {
    select: {title: 'title', pageType: 'pageType', status: 'status'},
    prepare({title, pageType, status}) {
      return {
        title,
        subtitle: [pageType, status].filter(Boolean).join(' · '),
      }
    },
  },
})
