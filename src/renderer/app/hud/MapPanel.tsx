/**
 * The map panel. Phase-28 — ADR-038.
 *
 * Where the farm reaches past what you can walk to. Each destination shows what
 * it costs to outfit, what a hand brings back, how long they are gone, and
 * either a Send button or the standing it waits for — the notice board's shape,
 * because a locked destination and a locked board slot are the same promise.
 *
 * ## The countdown is computed HERE, not published
 *
 * The `expeditions` slice carries `departedTick` and `returnsAtTick` and no
 * remaining time, because a countdown changes every tick and would republish
 * the slice 20 times a second for the whole of an hours-long trip (ADR-005 §2).
 * This panel is already re-rendering against the `status` slice's tick, which
 * moves once a second, so the subtraction is free where it happens and
 * expensive where it does not.
 *
 * ## Send picks the hand, the player picks the place
 *
 * A worker chooser would be a second selection model for a widget that fits in
 * a strip. Send takes the first hand who can actually go — idle, empty-handed,
 * not already away — and the button says why when nobody can, because a dead
 * button with no reason is the failure `GAME_DESIGN.md` §10.1 warns about.
 */

import { useState, type ReactNode } from 'react';

import { useSlice } from '../hooks/use-slice';
import { usePlayer } from '../store-context';

import { AtlasSprite, ItemIcon } from './ItemIcon';
import styles from './MapPanel.module.css';

/** What a locked destination says instead of Send (ADR-038 §6). */
const LOCKED_LABEL: Readonly<Record<string, string>> = {
  newcomer: '',
  friend: 'for friends of the town',
  pillar: 'for pillars of the town',
};

/** Ticks per second — the clock every readout in this project counts in. */
const TICKS_PER_SECOND = 20;

/** A duration in ticks, worded for a glance. Never a bare tick count. */
function readableTicks(ticks: number): string {
  const seconds = Math.max(0, Math.ceil(ticks / TICKS_PER_SECOND));
  if (seconds < 60) return `${String(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest === 0 ? `${String(minutes)}m` : `${String(minutes)}m ${String(rest)}s`;
}

/** `place_delta.png` from `ui-world:place_delta` — the frame `AtlasSprite` wants. */
function frameOf(spriteKey: string): string {
  const colon = spriteKey.indexOf(':');
  return `${colon === -1 ? spriteKey : spriteKey.slice(colon + 1)}.png`;
}

export function MapPanel(): ReactNode {
  const map = useSlice('expeditions');
  const workers = useSlice('workers');
  const inventory = useSlice('inventory');
  const status = useSlice('status');
  const player = usePlayer();
  const [open, setOpen] = useState(false);

  // WHO CAN ACTUALLY GO, matched to what the validator refuses and nothing
  // more. Empty-handed, and not part-way along a route — a hauler's hold is a
  // delivery something downstream is already counting on (ADR-036 as amended).
  //
  // State is deliberately NOT part of this. Pulling a hand off a till or a
  // plant is fine, the task is simply dropped — and filtering on `idle` was
  // the first version, which made Send permanently dead on any farm with
  // untilled ground, because a worker is almost never idle.
  //
  // A worker who is AWAY is absent from this slice entirely (ADR-038 §2), so
  // nobody on a trip can be counted as available with no check for it here.
  const available = workers.filter(
    (worker) =>
      worker.carrying === 0 && worker.task?.kind !== 'haul' && worker.task?.kind !== 'deliver',
  );
  // Just the count. "· 1 away" was the first version and the extra characters
  // cost the status bar its width on a 1400px screen; the worker panel two
  // chips away already says "away" in words.
  const badge = map.trips.length > 0 ? ` · ${String(map.trips.length)}` : '';

  // WHAT THE FARM HOLDS, across inventory and sheds — the `inventory` slice
  // already aggregates both, and so does the command's check.
  //
  // Without this the Send button was enabled on a farm with no seed, the click
  // was refused as `MissingItem`, and nothing happened or explained itself.
  // Found on the running app, not by a test: a fresh world starts with 100
  // coins and no seed, so the FIRST thing a new player would have done is the
  // thing that silently did nothing.
  const held = new Map(inventory.stacks.map((stack) => [stack.item, stack.quantity]));
  const canOutfit = (
    supplies: readonly { readonly item: string; readonly quantity: number }[],
  ): boolean => supplies.every((stack) => (held.get(stack.item) ?? 0) >= stack.quantity);

  return (
    <div className={styles['container']} data-interactive data-testid="map">
      <button
        type="button"
        className={styles['toggle']}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        Map{badge}
      </button>

      {open && (
        <div className={styles['panel']}>
          {map.trips.length > 0 && (
            <>
              <div className={styles['section']}>Away</div>
              {map.trips.map((trip) => {
                const place = map.destinations.find((d) => d.id === trip.destination);
                return (
                  <div key={trip.worker} className={styles['row']} data-testid="trip">
                    <span className={styles['name']}>
                      Worker {trip.worker} · {place?.displayName ?? 'somewhere'}
                    </span>
                    <span className={styles['muted']}>
                      back in {readableTicks(trip.returnsAtTick - status.tick)}
                    </span>
                  </div>
                );
              })}
            </>
          )}

          <div className={styles['section']}>Where you can send them</div>
          {map.destinations.map((place) => (
            <div key={place.id} className={styles['place']} data-testid="destination">
              <div className={styles['row']}>
                <AtlasSprite frameName={frameOf(place.sprite)} size={24} />
                <span className={styles['name']}>
                  {place.displayName}
                  <span className={styles['muted']}>
                    {' '}
                    · {readableTicks(place.travelTicks)} away
                  </span>
                </span>
                {place.unlocked ? (
                  <button
                    type="button"
                    className={
                      available.length > 0 && canOutfit(place.supplies)
                        ? styles['send']
                        : styles['sendDisabled']
                    }
                    disabled={available.length === 0 || !canOutfit(place.supplies)}
                    title={
                      available.length === 0
                        ? 'Nobody is free and empty-handed right now.'
                        : canOutfit(place.supplies)
                          ? `Send worker ${String(available[0]?.id ?? 0)}`
                          : 'Not enough supplies to outfit the trip.'
                    }
                    onClick={() => {
                      const worker = available[0];
                      if (worker === undefined) return;
                      player.submit({
                        type: 'sendExpedition',
                        worker: worker.id,
                        destination: place.id,
                      });
                    }}
                  >
                    Send
                  </button>
                ) : (
                  // Visible but not sendable, exactly as a locked board slot is
                  // (ADR-038 §6): the player sees where a proven name can go.
                  <span
                    className={styles['lock']}
                    title="Deliver more contracts and the town will vouch for you."
                  >
                    {LOCKED_LABEL[place.requires] ?? 'locked'}
                  </span>
                )}
              </div>

              <div className={styles['detail']}>{place.description}</div>

              <div className={styles['row']}>
                <span className={styles['muted']}>Takes</span>
                {place.supplies.length === 0 ? (
                  <span className={styles['muted']}>nothing</span>
                ) : (
                  place.supplies.map((stack) => (
                    <span key={stack.item} className={styles['stack']}>
                      <ItemIcon item={stack.item} size={18} />
                      {stack.quantity}
                    </span>
                  ))
                )}
                <span className={styles['muted']}>· Brings</span>
                {place.yields.map((stack) => (
                  <span key={stack.item} className={styles['stack']}>
                    <ItemIcon item={stack.item} size={18} />~{stack.quantity}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
