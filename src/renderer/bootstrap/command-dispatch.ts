/**
 * The player's command source. Phase-03.6, ADR-010 §6.
 *
 * The first real `CommandProducer`. It is deliberately trivial — binding a
 * dispatcher to the `player` tag and forwarding — because that triviality IS
 * the architecture: the player gets no privileged API, no direct store access,
 * and no bypass. Worker AI (phase-04) and automation (phase-06) construct the
 * same shape against the same dispatcher.
 *
 * The source tag is captured here, not passed per call, so nothing downstream
 * can submit under another identity and a replay's provenance stays honest.
 */

import type { CommandDispatcher } from '../../sim/commands/dispatcher';
import type { PlayerInputSource } from '../../sim/commands/sources';
import { CommandSource, type Command, type CommandResult } from '../../sim/commands/types';

export function createPlayerInputSource(dispatcher: CommandDispatcher): PlayerInputSource {
  return {
    source: CommandSource.Player,

    submit(command: Command): CommandResult {
      // Returns acceptance, not execution: the command runs in `preUpdate` of
      // the next tick (ADR-010 §3). Callers surface a rejection immediately.
      return dispatcher.dispatch(command, { source: CommandSource.Player });
    },
  };
}
