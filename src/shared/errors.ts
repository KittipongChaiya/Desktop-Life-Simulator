/**
 * Error taxonomy.
 *
 * Errors are plain data, not `Error` subclasses, so they survive the structured
 * clone across IPC and serialize into logs without losing their context.
 */

export const ErrorCode = {
  TileOutOfBounds: 'tile_out_of_bounds',
  TileNotOwned: 'tile_not_owned',
  TileWrongKind: 'tile_wrong_kind',
  MissingItem: 'missing_item',
  /** The crop cannot be planted in the current season (ADR-021 §2). */
  OutOfSeason: 'out_of_season',
  InventoryFull: 'inventory_full',
  InsufficientFunds: 'insufficient_funds',
  UnknownContent: 'unknown_content',
  DuplicateContent: 'duplicate_content',
  InvalidIntent: 'invalid_intent',
  DuplicateCommand: 'duplicate_command',
  PathUnreachable: 'path_unreachable',
  SaveCorrupt: 'save_corrupt',
  SaveFromNewerVersion: 'save_from_newer_version',
  SaveWriteFailed: 'save_write_failed',
  MigrationFailed: 'migration_failed',
  ValidationFailed: 'validation_failed',
  IpcRejected: 'ipc_rejected',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface AppError {
  readonly code: ErrorCode;
  /** Operator-facing detail. Not shown verbatim to the player. */
  readonly message: string;
  /** Structured context for logs. Must be JSON-serializable. */
  readonly context?: Readonly<Record<string, string | number | boolean>>;
}

export function appError(
  code: ErrorCode,
  message: string,
  context?: Readonly<Record<string, string | number | boolean>>,
): AppError {
  return context === undefined ? { code, message } : { code, message, context };
}
