import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { ApiError, previewAudience } from './api';
import ConditionRow from './ConditionRow';
import type { AudienceRequest, Condition, Operator, PreviewResponse } from './types';

const DEFAULT_AS_OF = '2026-09-29T00:00:00.000Z';
const MAX_CONDITIONS = 10;

interface ConditionEntry {
  id: string;
  condition: Condition;
}

type PreviewState =
  | { kind: 'idle' }
  | { kind: 'validation'; issues: string[] }
  | { kind: 'loading' }
  | { kind: 'success'; result: PreviewResponse }
  | { kind: 'empty'; result: PreviewResponse }
  | { kind: 'error'; message: string };

function newConditionEntry(): ConditionEntry {
  return {
    id: crypto.randomUUID(),
    condition: { eventType: 'product_view', operator: 'at_least', count: 2, withinDays: 7 },
  };
}

function operatorPhrase(operator: Operator): string {
  return operator === 'at_least' ? 'at least' : 'exactly';
}

export default function App() {
  const [name, setName] = useState('Viewed but not purchased');
  const [asOf, setAsOf] = useState(DEFAULT_AS_OF);
  const [conditions, setConditions] = useState<ConditionEntry[]>([newConditionEntry()]);
  const [status, setStatus] = useState<PreviewState>({ kind: 'idle' });

  function updateCondition(id: string, patch: Partial<Condition>): void {
    setConditions((current) =>
      current.map((entry) =>
        entry.id === id ? { ...entry, condition: { ...entry.condition, ...patch } } : entry,
      ),
    );
  }

  function removeCondition(id: string): void {
    setConditions((current) =>
      current.length > 1 ? current.filter((entry) => entry.id !== id) : current,
    );
  }

  function addCondition(): void {
    setConditions((current) =>
      current.length < MAX_CONDITIONS ? [...current, newConditionEntry()] : current,
    );
  }

  function validateRequest(): { request?: AudienceRequest; issues: string[] } {
    const issues: string[] = [];
    if (!name.trim()) {
      issues.push('Audience name is required.');
    }
    if (!Number.isFinite(Date.parse(asOf))) {
      issues.push('asOf must be a valid ISO 8601 timestamp, e.g. 2026-09-29T00:00:00.000Z');
    }
    if (conditions.length === 0) {
      issues.push('Add at least one condition.');
    }
    conditions.forEach(({ condition }, index) => {
      if (!Number.isInteger(condition.count) || condition.count < 0 || condition.count > 1_000_000) {
        issues.push(`Condition ${index + 1}: count must be an integer between 0 and 1,000,000.`);
      }
      if (
        !Number.isInteger(condition.withinDays) ||
        condition.withinDays < 1 ||
        condition.withinDays > 365
      ) {
        issues.push(`Condition ${index + 1}: "within days" must be an integer between 1 and 365.`);
      }
    });
    if (issues.length > 0 || !Number.isFinite(Date.parse(asOf))) {
      return { issues };
    }
    return {
      issues,
      request: {
        name: name.trim(),
        asOf,
        conditions: conditions.map((entry) => entry.condition),
      },
    };
  }

  async function runPreview(request: AudienceRequest): Promise<void> {
    setStatus({ kind: 'loading' });
    try {
      const result = await previewAudience(request);
      setStatus(result.total === 0 ? { kind: 'empty', result } : { kind: 'success', result });
    } catch (error) {
      if (error instanceof ApiError) {
        const detail = error.details?.length ? ` (${error.details.join('; ')})` : '';
        setStatus({ kind: 'error', message: `${error.message}${detail}` });
      } else {
        setStatus({ kind: 'error', message: 'Something went wrong. Please retry.' });
      }
    }
  }

  async function handleSubmit(event?: FormEvent): Promise<void> {
    event?.preventDefault();
    const { request, issues } = validateRequest();
    if (!request) {
      setStatus({ kind: 'validation', issues });
      return;
    }
    await runPreview(request);
  }

  function renderResults(): ReactNode {
    switch (status.kind) {
      case 'idle':
        return (
          <p className="state-hint">
            Define an audience on the left, then choose <strong>Preview audience</strong> to see
            which anonymous users match and the evidence that explains each match.
          </p>
        );
      case 'validation':
        return (
          <div className="alert" role="alert">
            <p>
              <strong>Check the form before previewing:</strong>
            </p>
            <ul>
              {status.issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          </div>
        );
      case 'loading':
        return (
          <p className="state-loading" aria-live="polite">
            Previewing audience…
          </p>
        );
      case 'empty':
        return (
          <div className="state-empty">
            <p>
              <strong>No users matched this audience.</strong>
            </p>
            <p>
              Try lowering the counts or widening the time window, then preview again. The API can
              be reached — it simply found no match.
            </p>
          </div>
        );
      case 'error':
        return (
          <div className="alert error" role="alert">
            <p>
              <strong>Preview failed:</strong> {status.message}
            </p>
            <button type="button" className="button primary retry" onClick={() => void handleSubmit()}>
              Retry
            </button>
          </div>
        );
      case 'success': {
        const result = status.result;
        return (
          <div>
            <p className="audience-size">
              Audience size: <strong>{result.total}</strong>
            </p>
            <p className="results-meta">
              “{result.name}” as of <code>{result.asOf}</code>
            </p>
            <ul className="member-list">
              {result.members.map((member) => (
                <li key={member.anonymousId} className="member-card">
                  <code className="member-id">{member.anonymousId}</code>
                  <ul className="evidence">
                    {member.evidence.map((item, evidenceIndex) => (
                      <li key={evidenceIndex}>
                        <code>{item.eventType}</code>
                        <span className="evidence-detail">
                          observed {item.observedCount} · needs {operatorPhrase(item.operator)}{' '}
                          {item.expectedCount} within {item.withinDays} days
                        </span>
                        <span className={`pill ${item.passed ? 'pill-pass' : 'pill-fail'}`}>
                          {item.passed ? 'met' : 'not met'}
                        </span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </div>
        );
      }
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>AudienceIQ</h1>
        <p>
          Define audience rules over anonymous product events and preview the matching audience
          with per-user evidence.
        </p>
      </header>

      <main className="layout">
        <section className="card rule-card" aria-labelledby="rule-heading">
          <h2 id="rule-heading">Audience definition</h2>
          <form onSubmit={(event) => void handleSubmit(event)} noValidate>
            <div className="field">
              <label htmlFor="audience-name">Audience name</label>
              <input
                id="audience-name"
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Viewed but not purchased"
                maxLength={120}
              />
            </div>

            <div className="field">
              <label htmlFor="as-of">Reference time (asOf)</label>
              <input
                id="as-of"
                type="text"
                value={asOf}
                onChange={(event) => setAsOf(event.target.value)}
                aria-describedby="as-of-hint"
                spellCheck={false}
              />
              <p id="as-of-hint" className="hint">
                ISO 8601 timestamp such as 2026-09-29T00:00:00.000Z. Evaluation is relative to
                this instant, never the server clock, so previews are reproducible.
              </p>
            </div>

            <fieldset className="conditions">
              <legend>Conditions (combined with AND)</legend>
              {conditions.map((entry, index) => (
                <ConditionRow
                  key={entry.id}
                  index={index}
                  condition={entry.condition}
                  canRemove={conditions.length > 1}
                  onChange={(patch) => updateCondition(entry.id, patch)}
                  onRemove={() => removeCondition(entry.id)}
                />
              ))}
              <button
                type="button"
                className="button secondary"
                onClick={addCondition}
                disabled={conditions.length >= MAX_CONDITIONS}
              >
                + Add condition
              </button>
            </fieldset>

            <div className="actions">
              <button
                type="submit"
                className="button primary"
                disabled={status.kind === 'loading'}
                aria-busy={status.kind === 'loading'}
              >
                Preview audience
              </button>
            </div>
          </form>
        </section>

        <section className="card results-card" aria-labelledby="results-heading" aria-live="polite">
          <h2 id="results-heading">Preview results</h2>
          {renderResults()}
        </section>
      </main>
    </div>
  );
}
