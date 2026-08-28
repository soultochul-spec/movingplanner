import type { Plan, Member, PlanBundle } from "./types";
export function memberPermissions(plan: Plan, members: Member[], actorId?: string): { current?: Member; representative?: Member; isRepresentative: boolean; canAppoint: boolean };
export function removeLocalMember(bundle: PlanBundle, memberId: string, actorId: string): PlanBundle;
export function appointLocalRepresentative(bundle: PlanBundle, memberId: string, actorId: string): PlanBundle;
