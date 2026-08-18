export type Category = "행정" | "업체/예약" | "짐 정리" | "공과금" | "계약/정산" | "입주";
export type Priority = "높음" | "보통" | "낮음";

export type Plan = {
  id: string;
  name: string;
  moveDate: string;
  origin?: string;
  destination?: string;
  shareToken: string;
  createdAt: string;
};

export type Member = { id: string; planId: string; displayName: string; sessionId: string };

export type Task = {
  id: string;
  planId: string;
  title: string;
  description: string;
  category: Category;
  relativeDays: number;
  priority: Priority;
  assigneeId?: string;
  completed: boolean;
  completedBy?: string;
  completedAt?: string;
  note?: string;
  createdAt: string;
};

export type PlanBundle = { plan: Plan; tasks: Task[]; members: Member[] };
