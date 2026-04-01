interface GameDefinition<S = any, A = any> {
    manifest: GameManifest;
    setup(ctx: SetupContext): S;
    actions(state: S, playerId: string): A[];
    perform(state: S, playerId: string, action: A): S;
    view(state: S, playerId: string | null): PlayerView;
    isOver(state: S): GameResult | null;
    turnConfig(state: S, playerId: string | null): TurnConfig<A> | null;
}
interface SetupContext {
    players: Player[];
    config: Record<string, unknown>;
    random: SeededRandom;
    /** Original seed number — used by isolate adapters that can't receive SeededRandom across boundaries. */
    seed?: number;
    teamAssignments?: Record<string, string>;
}
interface GameManifest {
    slug: string;
    name: string;
    description: string;
    minPlayers: number;
    maxPlayers: number;
    version: string;
    tags: string[];
    settings?: SettingDef[];
    teams?: number;
    rules: string;
}
interface SettingDef {
    key: string;
    label: string;
    type: "number" | "select" | "boolean";
    default: unknown;
    options?: {
        value: unknown;
        label: string;
    }[];
    min?: number;
    max?: number;
}
interface Player {
    id: string;
    name: string;
}
interface PlayerView {
    [key: string]: unknown;
}
interface GameResult {
    winners: string[];
    scores?: Record<string, number>;
    summary?: string;
}
interface TurnConfig<A = any> {
    timeoutMs?: number;
    defaultAction?: A;
    spectatorChat?: boolean;
}
interface SeededRandom {
    next(): number;
    integer(min: number, max: number): number;
    shuffle<T>(array: T[]): T[];
    pick<T>(array: T[]): T;
}
declare const SYSTEM_ACTOR_ID: "__system__";
type SystemAction = {
    type: "player_left";
    playerId: string;
} | {
    type: "player_joined";
    playerId: string;
    name: string;
} | {
    type: "timer_expired";
    timerId: string;
    autoAction?: unknown;
} | {
    type: "player_disconnected";
    playerId: string;
};
interface ActionLogEntry<A = any> {
    playerId: string;
    action: A;
    timestamp: number;
}
interface ChatMessage {
    id?: string;
    playerId: string;
    text: string;
    channel: "room" | "team" | "whisper" | "spectator";
    timestamp: number;
    whisperTo?: string;
    /** Present when message was sent using a channel grant (e.g., "coin_purchase"). */
    grantSource?: string;
}
declare const MAX_CHAT_MESSAGES = 150;
interface ThemeColors {
    primary: string;
    background: string;
    surface: string;
    text: string;
    muted: string;
}

declare class GameEngine<S = any, A = any> {
    private state;
    private actionLog;
    private game;
    constructor(game: GameDefinition<S, A>, players: Player[], config: Record<string, unknown>, seed: number, teamAssignments?: Record<string, string>);
    static fromActionLog<S, A>(game: GameDefinition<S, A>, players: Player[], config: Record<string, unknown>, seed: number, log: ActionLogEntry<A>[], teamAssignments?: Record<string, string>): GameEngine<S, A>;
    processAction(playerId: string, action: A, timestamp?: number): void;
    getState(): S;
    getView(playerId: string | null): PlayerView;
    getActions(playerId: string): A[];
    getResult(): GameResult | null;
    getTurnConfig(playerId: string | null): TurnConfig | null;
    getActionLog(): ActionLogEntry<A>[];
}

/**
 * Mulberry32 — a simple, fast 32-bit PRNG with good distribution.
 * Deterministic: same seed always produces same sequence.
 */
declare function createSeededRandom(seed: number): SeededRandom;

/** Result of a single validation check. */
interface ValidationResult {
    name: string;
    passed: boolean;
    error?: string;
}
/** Full validation report. */
interface ValidationReport {
    results: ValidationResult[];
    passed: number;
    failed: number;
    warnings: number;
}
/**
 * Validate a game against the platform contract.
 * Runs a battery of automated checks that catch common bugs
 * in game implementations — determinism, purity, view filtering,
 * turnConfig coverage, dead player handling, and action round-trips.
 *
 * Usage in tests:
 * ```ts
 * import { validateGame } from "@playgent/core";
 * const report = validateGame(MyGame);
 * expect(report.failed).toBe(0);
 * ```
 */
declare function validateGame(game: GameDefinition, seeds?: number[]): ValidationReport;

export { type ActionLogEntry, type ChatMessage, type GameDefinition, GameEngine, type GameManifest, type GameResult, MAX_CHAT_MESSAGES, type Player, type PlayerView, SYSTEM_ACTOR_ID, type SeededRandom, type SettingDef, type SetupContext, type SystemAction, type ThemeColors, type TurnConfig, type ValidationReport, type ValidationResult, createSeededRandom, validateGame };
