import { createFieldMap } from '@tanstack/react-form'
import { withFieldGroup } from '../../context/form-context'

const metadataDefaults = { title: '', author: '' }

export const metadataFieldMap = createFieldMap(metadataDefaults)

export const MetadataFields = withFieldGroup({
  defaultValues: metadataDefaults,
  props: { disabled: false as boolean },
  render: function Render({ group, disabled }) {
    return (
      <div className="space-y-3 mb-6">
        <group.Field name="title">
          {(field) => (
            <div className="space-y-1">
              <label htmlFor={field.name} className="field-label">
                Title
              </label>
              <input
                id={field.name}
                type="text"
                placeholder="Title"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                disabled={disabled}
                className="field-input"
              />
            </div>
          )}
        </group.Field>
        <group.Field name="author">
          {(field) => (
            <div className="space-y-1">
              <label htmlFor={field.name} className="field-label">
                Author (optional)
              </label>
              <input
                id={field.name}
                type="text"
                placeholder="Author"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                disabled={disabled}
                className="field-input"
              />
            </div>
          )}
        </group.Field>
      </div>
    )
  },
})
