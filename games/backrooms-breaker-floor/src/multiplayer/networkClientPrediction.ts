import type { LocalPlayerSyncState } from "./PublicRoomService";
import type { MatchPlayerSnapshot, MatchVector } from "./protocol";

export const INPUT_SEND_INTERVAL_MS = 1000 / 30;
const MAX_LOCAL_PREDICTION_ERROR_PX = 48;
const VECTOR_EPSILON = 0.0001;

function vectorDistanceSquared(a: MatchVector, b: MatchVector): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function positionError(authoritative: MatchPlayerSnapshot, predictedX: number, predictedY: number): number {
  return Math.hypot(authoritative.x - predictedX, authoritative.y - predictedY);
}

function pickFacingVector(authoritative: MatchVector, candidate: MatchVector): MatchVector {
  const hasFacing = Math.abs(candidate.x) > VECTOR_EPSILON || Math.abs(candidate.y) > VECTOR_EPSILON;
  return hasFacing ? candidate : authoritative;
}

export function buildPredictedLocalPlayerSnapshot(
  authoritative: MatchPlayerSnapshot | null,
  state: LocalPlayerSyncState
): MatchPlayerSnapshot | null {
  if (!authoritative) {
    return null;
  }

  const canPredict = !authoritative.isDead && positionError(authoritative, state.x, state.y) <= MAX_LOCAL_PREDICTION_ERROR_PX;
  return {
    ...authoritative,
    x: canPredict ? state.x : authoritative.x,
    y: canPredict ? state.y : authoritative.y,
    facing: pickFacingVector(authoritative.facing, state.facing),
    flashlightOn: state.flashlightOn
  };
}

export function reconcilePredictedLocalPlayerSnapshot(
  authoritative: MatchPlayerSnapshot | null,
  predicted: MatchPlayerSnapshot | null
): MatchPlayerSnapshot | null {
  if (!authoritative) {
    return null;
  }

  if (!predicted || authoritative.isDead) {
    return authoritative;
  }

  const predictionError = positionError(authoritative, predicted.x, predicted.y);
  if (predictionError > MAX_LOCAL_PREDICTION_ERROR_PX) {
    return authoritative;
  }

  return {
    ...authoritative,
    x: predicted.x,
    y: predicted.y,
    facing: predicted.facing
  };
}

export function shouldSendInputUpdate(
  current: LocalPlayerSyncState,
  previous: LocalPlayerSyncState | null,
  now: number,
  lastSentAt: number
): boolean {
  if (!previous) {
    return true;
  }

  if (current.wantsInteract || current.wantsPunch) {
    return true;
  }

  if (vectorDistanceSquared(current.move, previous.move) > VECTOR_EPSILON) {
    return true;
  }

  if (vectorDistanceSquared(current.facing, previous.facing) > VECTOR_EPSILON) {
    return true;
  }

  if (current.flashlightOn !== previous.flashlightOn) {
    return true;
  }

  return now - lastSentAt >= INPUT_SEND_INTERVAL_MS;
}
