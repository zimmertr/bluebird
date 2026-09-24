import { text } from '../plugin.js'

// An opening tag of one element that carries, or lacks, one attribute.
const tag = (name) => `JSXOpeningElement[name.name="${name}"]`
const attr = (name, value) =>
  value === undefined
    ? `JSXAttribute[name.name="${name}"]`
    : `JSXAttribute[name.name="${name}"][value.value="${value}"]`
const newTab = `${tag('a')}:has(${attr('target', '_blank')})`

export const ACCESSIBILITY = [
  {
    // Two of the six close crosses once reached the accessibility tree where
    // the other four did not, so one button announced its label twice. Every
    // glyph stands inside a control that already carries its own name, so an
    // icon that is announced is only ever announced a second time.
    name: 'glyphs-hidden',
    files: ['src/components/icons.tsx'],
    ban: [
      {
        selector: `${tag('svg')}:not(:has(${attr('aria-hidden', 'true')}))`,
        message: 'Hide every drawn glyph from assistive technology with aria-hidden="true".',
      },
    ],
    // Vacuous if the module stops being where the glyphs are.
    require: [{ selector: tag('svg'), min: 10, message: 'icons.tsx draws the glyphs.' }],
  },
  {
    // The one glyph drawn as markup for a map popup rather than as an element.
    // Its opening tag is built from several template chunks joined by `+`, so
    // the whole expression is what must carry the attribute.
    name: 'markup-glyph-hidden',
    files: ['src/iconPaths.ts'],
    ban: [
      {
        selector: [
          'BinaryExpression[operator="+"]:not(BinaryExpression[operator="+"] > BinaryExpression)',
          'TemplateLiteral:not(BinaryExpression[operator="+"] > TemplateLiteral)',
        ]
          .map(
            (unit) =>
              `${unit}:has(TemplateElement[value.raw=/<svg/]):not(:has(TemplateElement[value.raw=/aria-hidden="true"/]))`,
          )
          .join(', '),
        message: 'Hide the popup glyph from assistive technology with aria-hidden="true".',
      },
    ],
    require: [
      { selector: 'TemplateElement[value.raw=/<svg/]', message: 'iconPaths.ts draws the popup glyph.' },
    ],
  },
  {
    // WCAG 2.4.4: a link's purpose has to be clear from the link itself, and
    // two of the table's links fail that on their text alone. The label is the
    // whole answer, and it also warns about the new tab.
    name: 'new-tab-anchors-named',
    files: ['src/components/ResultsTableRow.tsx'],
    ban: [
      {
        selector:
          `${newTab}:not(:has(${attr('aria-label')} TemplateElement[value.raw=/Opens in a new tab\\.$/]))` +
          `:not(:has(${attr('aria-label')} Literal[value=/Opens in a new tab\\.$/]))`,
        message: 'Give a new-tab anchor an aria-label ending "Opens in a new tab."',
      },
    ],
    require: [{ selector: newTab, min: 3, message: 'ResultsTableRow.tsx carries the new-tab anchors.' }],
  },
  {
    name: 'model-picker-roles',
    files: ['src/components/ModelPicker.tsx'],
    ban: [
      {
        // `optionDomId` builds an option's id from the option's own id. The
        // component must not go back to the loop counter or the active index,
        // which is what aria-activedescendant used to point at.
        selector: `JSXAttribute[name.name=/^(id|aria-activedescendant)$/] TemplateLiteral > Identifier[name=/^(i|active)$/]`,
        message: 'Build an option id from the option, never from its position in the list.',
      },
      {
        // The boxes carry no semantics: a focusable input inside an option
        // would be a second tab stop in a list whose keyboard model is one
        // element plus aria-activedescendant.
        selector:
          `${tag('input')}:has(${attr('type', 'checkbox')})` +
          `:not(:has(${attr('aria-hidden', 'true')}):has(${attr('tabIndex')} UnaryExpression[operator="-"][argument.value=1]))`,
        message: 'Keep a drawn checkbox out of the accessibility tree: aria-hidden="true" and tabIndex={-1}.',
      },
      {
        // The remove slot is drawn on every chip and hidden with `invisible`,
        // so moving the highlight cannot resize a chip under the pointer.
        selector: 'LogicalExpression[operator="&&"] > JSXElement:has(MemberExpression[object.name="CHIP"][property.name="remove"])',
        message: 'Hide the chip remove slot with invisible rather than rendering it conditionally.',
      },
      {
        // The list selects and the chips rank. An action below the list would
        // be a third gesture.
        selector: text('Clear comparison'),
        message: 'The model picker carries no action below the list.',
      },
    ],
    require: [
      { selector: attr('aria-activedescendant'), message: 'The list is one element plus aria-activedescendant.' },
      // More than one row is selected at a time.
      { selector: attr('aria-multiselectable'), message: 'Say the list is multi-selectable.' },
      { selector: `${tag('input')}:has(${attr('type', 'checkbox')})`, message: 'The rows draw their checkboxes.' },
      // The chips are buttons that act, not options that are chosen.
      { selector: attr('role', 'toolbar'), message: 'Give the chip row the toolbar role.' },
      {
        // A bare cross announces as "button" and nothing else.
        selector: `${attr('aria-label')} TemplateLiteral:has(TemplateElement[value.raw="Remove "]):has(> Identifier[name="label"])`,
        message: 'Name each chip remove button after its model.',
      },
      {
        selector: `${tag('button')}:has(MemberExpression[object.name="CHIP"][property.name="remove"])`,
        message: 'Draw the remove slot on every chip.',
      },
      { selector: 'Literal[value="invisible"]', message: 'Hide the idle remove slot with invisible.' },
    ],
  },
  {
    // Every comparison control lives in the panel's model picker. What is left
    // beside the chart's radios is a note, and a control here would be a second
    // place to do one thing.
    name: 'compare-notes-no-control',
    files: ['src/components/ModelCompare.tsx'],
    ban: [
      {
        selector: 'JSXOpeningElement[name.name=/^(select|button)$/]',
        message: 'The chart comparison notes carry no control.',
      },
    ],
  },
  {
    // A disabled control says it cannot be used and never why, so it carries
    // its reason as a title and again as hidden text for readers a title never
    // reaches. Every aria-describedby must have its hidden text to point at,
    // and the results header's sort hint is held to the same pairing.
    name: 'disabled-reason-twin',
    files: ['src/components/LayersPopover.tsx', 'src/components/ResultsTableHeader.tsx'],
    balance: [
      {
        selectors: [attr('aria-describedby'), `${attr('className')} > JSXExpressionContainer > Identifier[name="SR_ONLY"]`],
        message: 'Give every aria-describedby a hidden SR_ONLY twin.',
      },
    ],
  },
]
