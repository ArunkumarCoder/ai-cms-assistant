import {defineField, defineType} from 'sanity'
import {LinkIcon} from '@sanity/icons/Link'

export const ctaBlock = defineType({
  name: 'ctaBlock',
  title: 'Call to action',
  type: 'object',
  icon: LinkIcon,
  fields: [
    defineField({
      name: 'text',
      title: 'Button text',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'href',
      title: 'Link',
      type: 'url',
      validation: (Rule) => Rule.required().uri({scheme: ['http', 'https', 'mailto', 'tel']}),
    }),
    defineField({
      name: 'openInNewTab',
      title: 'Open in new tab',
      type: 'boolean',
      initialValue: false,
    }),
  ],
  preview: {
    select: {title: 'text', subtitle: 'href'},
  },
})
