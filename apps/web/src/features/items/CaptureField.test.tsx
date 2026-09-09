import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { capture } from '@corvonium/shared';
import type { Project } from '@corvonium/shared';
import { CaptureField } from './CaptureField';

/** 2026-09-09, a Wednesday. */
const NOW = new Date(2026, 8, 9, 12, 0).getTime();
const PROJECTS = [{ id: 'p-home', name: 'Home', color: '#E0A040' }] as Project[];

/*
  The parser is proved in `packages/shared`. What this covers is the half that can
  still be wrong with a correct parse: that the marking lands on the right
  characters and that a chip actually reports the match it names.
*/
function field(text: string, onDismiss = vi.fn()) {
  const parsed = capture(text, PROJECTS, NOW);
  render(
    <CaptureField
      text={text}
      matches={parsed.used}
      projectColour={(id) => PROJECTS.find((p) => p.id === id)?.color}
      onText={() => {}}
      onDismiss={onDismiss}
    />,
  );
  return { onDismiss, parsed };
}

describe('marking the words it used', () => {
  it('marks exactly what was consumed, and nothing else', () => {
    field('Take the garbage out every 2 days important home');

    expect(screen.getAllByRole('mark').map((m) => m.textContent)).toEqual([
      'every 2 days',
      'important',
      'home',
    ]);
  });

  it('leaves the untouched words unmarked but still shown', () => {
    // The raw line stays whole — nothing is silently rewritten.
    field('Renew the domain tomorrow');
    expect(screen.getByText(/Renew the domain/)).toBeInTheDocument();
    expect(screen.getAllByRole('mark')).toHaveLength(1);
  });

  it('shows no marking at all for an ordinary sentence', () => {
    field('Buy homework supplies');
    expect(screen.queryAllByRole('mark')).toHaveLength(0);
  });
});

describe('the chips', () => {
  it('offers one per value, labelled in words', () => {
    field('Take the garbage out every 2 days important home');

    expect(
      screen.getAllByRole('button', { name: /^Undo/ }).map((b) => b.getAttribute('aria-label')),
    ).toEqual(['Undo Every 2 days', 'Undo Important', 'Undo Home']);
  });

  it('reports the match it names when tapped', () => {
    const { onDismiss, parsed } = field('Call the bank important');

    fireEvent.click(screen.getByRole('button', { name: 'Undo Important' }));
    expect(onDismiss).toHaveBeenCalledWith(parsed.used[0]?.id);
  });

  it('carries the project colour, since the name alone is not the signal', () => {
    field('Fix the sink Home');
    const dot = screen.getByRole('button', { name: 'Undo Home' }).querySelector('span');
    expect(dot?.style.background).toBe('rgb(224, 160, 64)');
  });
});

describe('dictation', () => {
  it('is present but disabled until the voice block lands', () => {
    // Visible and labelled rather than absent, so the field does not change shape
    // when it arrives — and so it never pretends to work.
    field('anything');
    expect(screen.getByRole('button', { name: /Dictate/ })).toBeDisabled();
  });
});
