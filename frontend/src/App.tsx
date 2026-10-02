import { useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { ApiError, checkHealth, previewAudience } from './api';
import ConditionRow from './ConditionRow';
import Icon from './icons';
import type { AudienceRequest, Condition, Operator, PreviewResponse } from './types';

const DEFAULT_AS_OF_MS = Date.parse('2026-09-29T00:00:00.000Z');
const MAX_CONDITIONS = 10;

interface ConditionEntry {
  id: string;
  condition: Condition;
}

function msToLocalInputValue(ms: number): string {
  const date = new Date(ms);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function localInputToIso(value: string): string | undefined {
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) {
    return undefined;
  }
  return new Date(Math.round(ms / 1000) * 1000).toISOString();
}

type PreviewState =
  | { kind: 'idle' }
  | { kind: 'validation'; issues: string[] }
  | { kind: 'loading' }
  | { kind: 'success'; result: PreviewResponse }
  | { kind: 'empty'; result: PreviewResponse }
  | { kind: 'error'; message: string };

type HealthStatus = 'checking' | 'online' | 'offline';

function newConditionEntry(): ConditionEntry {
  return {
    id: crypto.randomUUID(),
    condition: { eventType: 'product_view', operator: 'at_least', count: 2, withinDays: 7 },
  };
}

function operatorGlyph(operator: Operator): string {
  return operator === 'at_least' ? '≥' : '=';
}

export default function App() {
  const [name, setName] = useState('Viewed but not purchased');
  const [asOfLocal, setAsOfLocal] = useState(() => msToLocalInputValue(DEFAULT_AS_OF_MS));
  const [conditions, setConditions] = useState<ConditionEntry[]>([newConditionEntry()]);
  const [status, setStatus] = useState<PreviewState>({ kind: 'idle' });
  const [apiStatus, setApiStatus] = useState<HealthStatus>('checking');

  useEffect(() => {
    void checkHealth().then((healthy) => setApiStatus(healthy ? 'online' : 'offline'));
  }, []);

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
    const asOfIso = localInputToIso(asOfLocal);
    if (!name.trim()) {
      issues.push('Audience name is required.');
    }
    if (!asOfIso) {
      issues.push('Choose a valid reference date and time.');
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
    if (issues.length > 0 || asOfIso === undefined) {
      return { issues };
    }
    return {
      issues,
      request: {
        name: name.trim(),
        asOf: asOfIso,
        conditions: conditions.map((entry) => entry.condition),
      },
    };
  }

  async function runPreview(request: AudienceRequest): Promise<void> {
    setStatus({ kind: 'loading' });
    try {
      const result = await previewAudience(request);
      setApiStatus('online');
      setStatus(result.total === 0 ? { kind: 'empty', result } : { kind: 'success', result });
    } catch (error) {
      if (error instanceof ApiError) {
        const detail = error.details?.length ? ` (${error.details.join('; ')})` : '';
        setStatus({ kind: 'error', message: `${error.message}${detail}` });
      } else {
        setStatus({ kind: 'error', message: 'Something went wrong. Please retry.' });
      }
      if (error instanceof ApiError && error.code === 'NETWORK_ERROR') {
        void checkHealth().then((healthy) => setApiStatus(healthy ? 'online' : 'offline'));
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
          <div className="state-panel state-idle">
            <div className="state-icon">
              <Icon name="chart" size={20} />
            </div>
            <p className="state-title">Nothing previewed yet</p>
            <p className="state-body">
              Define the audience on the left, then run a preview. Matching anonymous users and
              the evidence explaining each match will appear here.
            </p>
          </div>
        );
      case 'validation':
        return (
          <div className="alert alert-warn" role="alert">
            <div className="alert-header">
              <Icon name="alert" size={16} />
              <strong>Fix the form before previewing</strong>
            </div>
            <ul>
              {status.issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          </div>
        );
      case 'loading':
        return (
          <>
            <div className="skeleton-summary" aria-hidden="true">
              <div className="skeleton skeleton-stat" />
              <div className="skeleton skeleton-meta" />
            </div>
            <div className="skeleton-list" aria-hidden="true">
              <div className="skeleton skeleton-row" />
              <div className="skeleton skeleton-row" />
              <div className="skeleton skeleton-row" />
            </div>
            <p className="visually-hidden" aria-live="polite">
              Previewing audience…
            </p>
          </>
        );
      case 'empty':
        return (
          <div className="state-panel state-empty">
            <div className="state-icon">
              <Icon name="user-x" size={20} />
            </div>
            <p className="state-title">No users matched</p>
            <p className="state-body">
              The API is reachable — it simply found no matching users. Try lowering the counts
              or widening the time window, then preview again.
            </p>
          </div>
        );
      case 'error':
        return (
          <div className="alert alert-error" role="alert">
            <div className="alert-header">
              <Icon name="alert" size={16} />
              <strong>Preview failed</strong>
            </div>
            <p>{status.message}</p>
            <button
              type="button"
              className="button secondary"
              onClick={() => void handleSubmit()}
            >
              <Icon name="refresh" size={14} />
              Retry preview
            </button>
          </div>
        );
      case 'success': {
        const result = status.result;
        return (
          <div className="results">
            <div className="results-summary">
              <div className="stat">
                <span className="stat-number">{result.total}</span>
                <span className="stat-label">
                  matching user{result.total === 1 ? '' : 's'}
                </span>
              </div>
              <div className="results-meta">
                <span className="meta-name">“{result.name}”</span>
                <span className="meta-asof">
                  <Icon name="clock" size={12} />
                  as of {result.asOf}
                </span>
              </div>
            </div>
            <ul className="member-list">
              {result.members.map((member) => (
                <li key={member.anonymousId} className="member-card">
                  <span className="member-avatar" aria-hidden="true">
                    {member.anonymousId.replace(/\D/g, '').slice(-2) || '?'}
                  </span>
                  <div className="member-body">
                    <code className="member-id">{member.anonymousId}</code>
                    <ul className="evidence">
                      {member.evidence.map((item, evidenceIndex) => (
                        <li key={evidenceIndex} className="evidence-chip">
                          <code>{item.eventType}</code>
                          <span className="evidence-count">{item.observedCount}</span>
                          <span className="evidence-requirement">
                            needs {operatorGlyph(item.operator)}
                            {item.expectedCount} in {item.withinDays}d
                          </span>
                          <Icon name="check" size={12} />
                        </li>
                      ))}
                    </ul>
                  </div>
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
      <header className="app-bar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <Icon name="chart" size={16} />
          </span>
          <div className="brand-text">
            <span className="brand-name">AudienceIQ</span>
            <span className="brand-sub">Mable Audience Builder</span>
          </div>
        </div>
        <span className={`api-chip api-${apiStatus}`} role="status">
          <span className="api-dot" aria-hidden="true" />
          {apiStatus === 'checking' ? 'checking API' : apiStatus === 'online' ? 'API online' : 'API offline'}
        </span>
      </header>

      <main className="layout">
        <section className="card rule-card" aria-labelledby="rule-heading">
          <div className="card-header">
            <h2 id="rule-heading">Audience definition</h2>
            <p>
              Pick events, thresholds and time windows. Conditions are combined with AND, and
              evaluation is pinned to a reference instant so previews are reproducible.
            </p>
          </div>

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
              <label htmlFor="as-of">Reference time</label>
              <input
                id="as-of"
                type="datetime-local"
                step={1}
                value={asOfLocal}
                onChange={(event) => setAsOfLocal(event.target.value)}
                aria-describedby="as-of-hint"
              />
              <p id="as-of-hint" className="hint asof-preview">
                {localInputToIso(asOfLocal) ? (
                  <>
                    evaluated as <code>{localInputToIso(asOfLocal)}</code> (UTC)
                  </>
                ) : (
                  'previews are evaluated relative to this instant'
                )}
              </p>
            </div>

            <div className="field conditions-head">
              <span className="label-like" aria-hidden="true">
                Conditions
              </span>
            </div>

            <div className="conditions" role="group" aria-label="Audience conditions (combined with AND)">
              {conditions.map((entry, index) => (
                <div key={entry.id} className="condition-block">
                  {index > 0 && (
                    <div className="condition-divider" aria-hidden="true">
                      <span>AND</span>
                    </div>
                  )}
                  <ConditionRow
                    index={index}
                    condition={entry.condition}
                    canRemove={conditions.length > 1}
                    onChange={(patch) => updateCondition(entry.id, patch)}
                    onRemove={() => removeCondition(entry.id)}
                  />
                </div>
              ))}
            </div>

            <div className="builder-actions">
              <button
                type="button"
                className="button ghost"
                onClick={addCondition}
                disabled={conditions.length >= MAX_CONDITIONS}
              >
                <Icon name="plus" size={14} />
                Add condition
              </button>
              <button
                type="submit"
                className="button primary"
                disabled={status.kind === 'loading'}
                aria-busy={status.kind === 'loading'}
              >
                <Icon name="zap" size={14} />
                {status.kind === 'loading' ? 'Previewing…' : 'Preview audience'}
              </button>
            </div>
          </form>
        </section>

        <section className="card results-card" aria-labelledby="results-heading" aria-live="polite">
          <div className="card-header">
            <h2 id="results-heading">Preview</h2>
            <p>Matching results come from the backend API. The frontend never computes membership.</p>
          </div>
          {renderResults()}
        </section>
      </main>

      <footer className="page-footer">
        AudienceIQ · synthetic anonymous event data only · no personal information
      </footer>
    </div>
  );
}
