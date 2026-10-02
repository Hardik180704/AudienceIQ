import { EVENT_TYPES, OPERATORS } from './types';
import type { Condition, Operator } from './types';

interface ConditionRowProps {
  index: number;
  condition: Condition;
  canRemove: boolean;
  onChange: (patch: Partial<Condition>) => void;
  onRemove: () => void;
}

function operatorLabel(operator: Operator): string {
  return operator === 'at_least' ? 'is at least' : 'is exactly';
}

export default function ConditionRow({
  index,
  condition,
  canRemove,
  onChange,
  onRemove,
}: ConditionRowProps) {
  const fieldId = (field: string): string => `condition-${index}-${field}`;

  return (
    <div className="condition-row">
      <div className="condition-fields">
        <div className="field">
          <label htmlFor={fieldId('event-type')}>Event type</label>
          <select
            id={fieldId('event-type')}
            value={condition.eventType}
            onChange={(event) =>
              onChange({ eventType: EVENT_TYPES.find((t) => t === event.target.value) })
            }
          >
            {EVENT_TYPES.map((eventType) => (
              <option key={eventType} value={eventType}>
                {eventType}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor={fieldId('operator')}>Operator</label>
          <select
            id={fieldId('operator')}
            value={condition.operator}
            onChange={(event) =>
              onChange({ operator: OPERATORS.find((o) => o === event.target.value) })
            }
          >
            {OPERATORS.map((operator) => (
              <option key={operator} value={operator}>
                {operatorLabel(operator)}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor={fieldId('count')}>Count</label>
          <input
            id={fieldId('count')}
            type="number"
            min={0}
            step={1}
            value={condition.count}
            onChange={(event) => onChange({ count: Number(event.target.value) })}
          />
        </div>

        <div className="field">
          <label htmlFor={fieldId('within-days')}>Within days</label>
          <input
            id={fieldId('within-days')}
            type="number"
            min={1}
            max={365}
            step={1}
            value={condition.withinDays}
            onChange={(event) => onChange({ withinDays: Number(event.target.value) })}
          />
        </div>
      </div>

      <button
        type="button"
        className="button secondary remove-button"
        onClick={onRemove}
        disabled={!canRemove}
        aria-label={`Remove condition ${index + 1}`}
      >
        Remove
      </button>
    </div>
  );
}
