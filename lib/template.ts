import type { Category, Priority, Task } from "./types";

type Seed = Pick<Task, "title" | "description" | "category" | "relativeDays" | "priority">;

const seed = (title: string, category: Category, relativeDays: number, description: string, priority: Priority = "보통"): Seed => ({ title, category, relativeDays, description, priority });

export const DEFAULT_TASKS: Seed[] = [
  seed("이사 예산과 방식 정하기", "계약/정산", -56, "포장·반포장·직접 이사 중 선택하고 예산을 정합니다.", "높음"),
  seed("이사업체 3곳 이상 견적 비교", "업체/예약", -49, "작업 범위, 사다리차, 추가요금, 파손 책임을 계약서에 확인합니다.", "높음"),
  seed("새 집 실측 및 하자 사진 기록", "입주", -42, "가구·가전 배치에 필요한 치수와 기존 하자를 사진으로 남깁니다.", "높음"),
  seed("불필요한 물건 처분 시작", "짐 정리", -35, "판매·기부·대형폐기물 배출 일정을 정합니다."),
  seed("입주청소와 가구·가전 설치 예약", "업체/예약", -28, "입주 전 청소, 가구 배송, 에어컨 설치 일정을 예약합니다.", "높음"),
  seed("관리사무소 이사 동선 예약", "업체/예약", -21, "엘리베이터, 주차, 사다리차 가능 여부와 시간을 확인합니다.", "높음"),
  seed("주소 변경 대상 목록 만들기", "행정", -21, "은행, 카드, 보험, 구독, 배송 주소를 목록화합니다."),
  seed("인터넷·정수기·에어컨 이전 신청", "업체/예약", -14, "설치 가능일과 이전 비용을 확인합니다."),
  seed("도시가스 전출·전입 예약", "공과금", -14, "지역 도시가스 공급사에 해지·연결 일정을 예약합니다.", "높음"),
  seed("전기·수도 정산 절차 확인", "공과금", -14, "고객번호와 이사일 기준 정산 방법을 확인합니다.", "높음"),
  seed("냉장고·냉동실 비우기 계획", "짐 정리", -10, "남은 식재료를 소비하고 냉장고 청소 일정을 정합니다."),
  seed("잔금·관리비·중개수수료 준비", "계약/정산", -7, "이체 한도와 장기수선충당금 정산을 확인합니다.", "높음"),
  seed("귀중품·중요 서류 별도 보관", "짐 정리", -3, "신분증, 계약서, 통장, 도장, 현금은 직접 들고 갑니다.", "높음"),
  seed("이사업체·청소업체 재확인", "업체/예약", -2, "도착 시각, 주차, 추가 작업, 연락처를 다시 확인합니다.", "높음"),
  seed("세탁기 물 빼기·냉장고 비우기", "짐 정리", -1, "세탁기 배수와 냉장고 음식물·전원을 정리합니다."),
  seed("출발지 계량기·집 상태 촬영", "공과금", 0, "전기·가스·수도 계량기와 각 공간을 사진으로 남깁니다.", "높음"),
  seed("상차 전후 파손·누락 확인", "짐 정리", 0, "귀중품과 파손 여부를 체크하고 문제는 현장에서 기록합니다.", "높음"),
  seed("도착지 열쇠 수령·짐 배치", "입주", 0, "열쇠·카드키를 받고 배치도에 맞춰 가구 위치를 확인합니다.", "높음"),
  seed("전입신고 및 확정일자 확인", "행정", 1, "전입일로부터 14일 이내 전입신고를 처리합니다.", "높음"),
  seed("주소 변경 완료", "행정", 7, "목록의 금융·배송·구독 서비스 주소를 모두 변경합니다."),
  seed("하자·파손 보수 요청", "입주", 14, "사진과 함께 관리사무소·이사업체에 필요한 보수를 요청합니다.")
];

export function buildTasks(planId: string): Task[] {
  const createdAt = new Date().toISOString();
  return DEFAULT_TASKS.map((item) => ({ ...item, id: crypto.randomUUID(), planId, completed: false, createdAt }));
}

export function dueDate(moveDate: string, relativeDays: number) {
  const date = new Date(`${moveDate}T12:00:00+09:00`);
  date.setDate(date.getDate() + relativeDays);
  return date;
}

export function formatDate(date: Date | string) {
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(typeof date === "string" ? new Date(`${date}T12:00:00+09:00`) : date).replaceAll(". ", ".").replace(".", ".");
}
