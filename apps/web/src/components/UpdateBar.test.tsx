import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { UpdateBar } from './UpdateBar';

/*
  Worth testing precisely because it cannot be seen locally: a waiting service
  worker needs a second deploy, and the Browser pane has service workers switched
  off entirely. What is checkable is that the bar *offers* rather than acts.
*/

describe('UpdateBar', () => {
  it('says a version is waiting without doing anything about it', () => {
    const onUpdate = vi.fn();
    render(<UpdateBar onUpdate={onUpdate} />);

    expect(screen.getByText('A new version is ready.')).toBeInTheDocument();
    // Rendering must never reload on its own — the whole point of `prompt` over
    // `autoUpdate` is that a running Work Mode clock is not interrupted for you.
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('reloads only when asked', () => {
    const onUpdate = vi.fn();
    render(<UpdateBar onUpdate={onUpdate} />);

    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(onUpdate).toHaveBeenCalledOnce();
  });
});
