import {defineField, defineType} from 'sanity'
import {HelpCircleIcon} from '@sanity/icons/HelpCircle'

export const faqItem = defineType({
  name: 'faqItem',
  title: 'FAQ item',
  type: 'object',
  icon: HelpCircleIcon,
  fields: [
    defineField({
      name: 'question',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'answer',
      type: 'text',
      rows: 3,
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'source',
      title: 'Source',
      type: 'string',
      options: {
        list: [
          {title: 'AI-generated', value: 'ai-generated'},
          {title: 'Manual', value: 'manual'},
        ],
        layout: 'radio',
      },
      initialValue: 'manual',
      validation: (Rule) => Rule.required(),
    }),
  ],
  preview: {
    select: {title: 'question', subtitle: 'answer'},
  },
})
