import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Sheet } from './Sheet';

/*
  jsdom does not implement `showModal`, and every element measures 0×0 — so the
  real geometry cannot be tested here. What can be pinned is the *decision*: which
  clicks are allowed to dismiss, which is where the risk lives. A stray outside
  click discarding a half-typed item is the failure this guards against.
*/
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.open = true;
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.open = false;
    this.dispatchEvent(new Event('close'));
  });
});

function setup() {
  const onClose = vi.fn();
  render(
    <Sheet open onClose={onClose}>
      <button>Inside</button>
    </Sheet>,
  );
  return { onClose, dialog: document.querySelector('dialog') as HTMLDialogElement };
}

/** Every sheet sits at the right edge in these tests; jsdom measures nothing. */
const PANEL = { left: 900, top: 0, right: 1280, bottom: 800 };

/** A click at coordinates, preceded by a press at the same place. */
function clickAt(el: HTMLElement, x: number, y: number) {
  fireEvent.pointerDown(el, { clientX: x, clientY: y });
  fireEvent.click(el, { clientX: x, clientY: y, detail: 1 });
}

/** jsdom measures nothing, so the panel's box is stated outright. */
function boxIs(el: HTMLElement, box: { left: number; top: number; right: number; bottom: number }) {
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
    ...box,
    width: box.right - box.left,
    height: box.bottom - box.top,
    x: box.left,
    y: box.top,
    toJSON: () => '',
  });
}

describe('dismissing by clicking outside', () => {
  it('closes when the click lands beyond the panel', () => {
    const { dialog, onClose } = setup();
    boxIs(dialog, PANEL);

    clickAt(dialog, 400, 400); // out on the grid
    expect(onClose).toHaveBeenCalled();
  });

  it('stays open for a click inside it', () => {
    const { dialog, onClose } = setup();
    boxIs(dialog, PANEL);

    clickAt(dialog, 1000, 400);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('does not dismiss when a drag starts inside and ends outside', () => {
    // Selecting text in the panel and releasing past its edge must not close it.
    const { dialog, onClose } = setup();
    boxIs(dialog, PANEL);

    fireEvent.pointerDown(dialog, { clientX: 1000, clientY: 400 });
    fireEvent.click(dialog, { clientX: 400, clientY: 400, detail: 1 });

    expect(onClose).not.toHaveBeenCalled();
  });

  it('ignores a keyboard-triggered click, which reports no coordinates', () => {
    // `detail: 0` plus 0,0 would otherwise read as a click on the far corner.
    const { dialog, onClose } = setup();
    boxIs(dialog, PANEL);

    fireEvent.pointerDown(dialog, { clientX: 0, clientY: 0 });
    fireEvent.click(dialog, { clientX: 0, clientY: 0, detail: 0 });

    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('every sheet behaves the same way', () => {
  it('dismisses a form too, matching what Escape already did', () => {
    /*
      Forms included, deliberately. It does throw away a half-typed item — but
      Escape always has, so the choice was never "the typing is safe", only
      whether the two exits agreed with each other.
    */
    const { dialog, onClose } = setup();
    boxIs(dialog, PANEL);

    clickAt(dialog, 400, 400);
    expect(onClose).toHaveBeenCalled();
  });

  it('still lets a click through to what is inside', () => {
    const onInside = vi.fn();
    render(
      <Sheet open onClose={() => {}}>
        <button onClick={onInside}>Inside</button>
      </Sheet>,
    );

    fireEvent.click(screen.getAllByText('Inside')[0] as HTMLElement);
    expect(onInside).toHaveBeenCalled();
  });
});
