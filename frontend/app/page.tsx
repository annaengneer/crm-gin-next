"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api";

type User = {
  id: string;
  name: string;
  email: string;
  role: string;
  isGuest: boolean;
  guestExpiresAt: string | null;
};

type Customer = {
  id: string;
  ownerId: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  memo: string | null;
  createdAt: string;
  updatedAt: string;
};

type CustomerForm = {
  name: string;
  company: string;
  email: string;
  phone: string;
  status: string;
  memo: string;
};

type Deal = {
  id: string;
  customerId: string;
  customerName: string;
  ownerId: string;
  title: string;
  amount: number;
  status: string;
  expectedCloseDate: string | null;
  memo: string | null;
  createdAt: string;
  updatedAt: string;
};

type DealForm = {
  customerId: string;
  title: string;
  amount: string;
  status: string;
  expectedCloseDate: string;
  memo: string;
};

type Activity = {
  id: string;
  customerId: string;
  customerName: string;
  ownerId: string;
  type: string;
  body: string;
  occurredAt: string;
  createdAt: string;
};

type Task = {
  id: string;
  customerId: string | null;
  dealId: string | null;
  ownerId: string;
  title: string;
  dueDate: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
};

type AuthResponse = {
  accessToken: string;
  user: User;
};

type MeResponse = {
  user: User;
};

type CustomersResponse = {
  customers: Customer[];
};

type CustomerResponse = {
  customer: Customer;
};

type DealsResponse = {
  deals: Deal[];
};

type DealResponse = {
  deal: Deal;
};

type ActivitiesResponse = {
  activities: Activity[];
};

type ActivityResponse = {
  activity: Activity;
};

type TasksResponse = {
  tasks: Task[];
};

type TaskResponse = {
  task: Task;
};

const tokenStorageKey = "crm_access_token";

const emptyCustomerForm: CustomerForm = {
  name: "",
  company: "",
  email: "",
  phone: "",
  status: "lead",
  memo: "",
};

const emptyDealForm: DealForm = {
  customerId: "",
  title: "",
  amount: "0",
  status: "open",
  expectedCloseDate: "",
  memo: "",
};

const statusLabels: Record<string, string> = {
  lead: "見込み",
  active: "進行中",
  paused: "保留",
  closed: "完了",
};

const dealStatusLabels: Record<string, string> = {
  open: "進行中",
  won: "受注",
  lost: "失注",
  paused: "保留",
};

const activityTypeLabels: Record<string, string> = {
  note: "メモ",
  call: "電話",
  email: "メール",
  meeting: "訪問",
};

function getTodayDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(
    null,
  );
  const [selectedDealId, setSelectedDealId] = useState<string | null>(null);
  const [form, setForm] = useState<CustomerForm>(emptyCustomerForm);
  const [dealForm, setDealForm] = useState<DealForm>(emptyDealForm);
  const [activityType, setActivityType] = useState("note");
  const [activityBody, setActivityBody] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isCustomersLoading, setIsCustomersLoading] = useState(false);
  const [isDealsLoading, setIsDealsLoading] = useState(false);
  const [isActivitiesLoading, setIsActivitiesLoading] = useState(false);
  const [isTasksLoading, setIsTasksLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDealSaving, setIsDealSaving] = useState(false);
  const [isActivitySaving, setIsActivitySaving] = useState(false);
  const [isTaskSaving, setIsTaskSaving] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedCustomer = useMemo(
    () =>
      customers.find((customer) => customer.id === selectedCustomerId) ?? null,
    [customers, selectedCustomerId],
  );

  const selectedDeal = useMemo(
    () => deals.find((deal) => deal.id === selectedDealId) ?? null,
    [deals, selectedDealId],
  );

  useEffect(() => {
    const storedToken = window.localStorage.getItem(tokenStorageKey);
    if (!storedToken) {
      setIsLoading(false);
      return;
    }

    apiGet<MeResponse>("/auth/me", { token: storedToken })
      .then((response) => {
        setUser(response.user);
        return Promise.all([
          loadCustomers(storedToken),
          loadDeals(storedToken),
          loadTodayTasks(storedToken),
        ]);
      })
      .catch(() => {
        window.localStorage.removeItem(tokenStorageKey);
        setUser(null);
        setCustomers([]);
        setDeals([]);
        setActivities([]);
        setTasks([]);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  async function loadCustomers(token: string) {
    setIsCustomersLoading(true);

    try {
      const response = await apiGet<CustomersResponse>("/customers", { token });
      setCustomers(response.customers);
    } finally {
      setIsCustomersLoading(false);
    }
  }

  async function loadDeals(token: string) {
    setIsDealsLoading(true);

    try {
      const response = await apiGet<DealsResponse>("/deals", { token });
      setDeals(response.deals);
    } finally {
      setIsDealsLoading(false);
    }
  }

  async function loadCustomerActivities(customerId: string, token: string) {
    setIsActivitiesLoading(true);

    try {
      const response = await apiGet<ActivitiesResponse>(
        `/customers/${customerId}/activities`,
        { token },
      );
      setActivities(response.activities);
    } finally {
      setIsActivitiesLoading(false);
    }
  }

  async function loadTodayTasks(token: string) {
    setIsTasksLoading(true);

    try {
      const response = await apiGet<TasksResponse>(
        `/tasks/today?date=${getTodayDate()}`,
        { token },
      );
      setTasks(response.tasks);
    } finally {
      setIsTasksLoading(false);
    }
  }

  async function handleGuestLogin() {
    setIsLoggingIn(true);
    setError(null);

    try {
      const response = await apiPost<AuthResponse>("/auth/guest");
      window.localStorage.setItem(tokenStorageKey, response.accessToken);
      setUser(response.user);
      await Promise.all([
        loadCustomers(response.accessToken),
        loadDeals(response.accessToken),
        loadTodayTasks(response.accessToken),
      ]);
    } catch {
      setError("ゲストログインに失敗しました。時間をおいて再度お試しください。");
    } finally {
      setIsLoggingIn(false);
    }
  }

  function handleLogout() {
    window.localStorage.removeItem(tokenStorageKey);
    setUser(null);
    setCustomers([]);
    setDeals([]);
    setActivities([]);
    setTasks([]);
    setSelectedCustomerId(null);
    setSelectedDealId(null);
    setForm(emptyCustomerForm);
    setDealForm(emptyDealForm);
    setActivityType("note");
    setActivityBody("");
    setTaskTitle("");
    setError(null);
  }

  function handleSelectCustomer(customer: Customer) {
    const token = window.localStorage.getItem(tokenStorageKey);
    setSelectedCustomerId(customer.id);
    setForm({
      name: customer.name,
      company: customer.company ?? "",
      email: customer.email ?? "",
      phone: customer.phone ?? "",
      status: customer.status,
      memo: customer.memo ?? "",
    });
    setActivityType("note");
    setActivityBody("");
    if (token) {
      loadCustomerActivities(customer.id, token).catch(() => {
        setError("活動履歴の読み込みに失敗しました。");
      });
    }
    setError(null);
  }

  function handleNewCustomer() {
    setSelectedCustomerId(null);
    setForm(emptyCustomerForm);
    setActivities([]);
    setActivityType("note");
    setActivityBody("");
    setError(null);
  }

  function handleSelectDeal(deal: Deal) {
    setSelectedDealId(deal.id);
    setDealForm({
      customerId: deal.customerId,
      title: deal.title,
      amount: String(deal.amount),
      status: deal.status,
      expectedCloseDate: deal.expectedCloseDate ?? "",
      memo: deal.memo ?? "",
    });
    setError(null);
  }

  function handleNewDeal() {
    setSelectedDealId(null);
    setDealForm({
      ...emptyDealForm,
      customerId: customers[0]?.id ?? "",
    });
    setError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const token = window.localStorage.getItem(tokenStorageKey);
    if (!token) {
      setError("顧客を保存するにはログインしてください。");
      return;
    }
    if (!form.name.trim()) {
      setError("顧客名を入力してください。");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      if (selectedCustomerId) {
        const response = await apiPut<CustomerResponse>(
          `/customers/${selectedCustomerId}`,
          form,
          { token },
        );
        setCustomers((current) =>
          current.map((customer) =>
            customer.id === selectedCustomerId ? response.customer : customer,
          ),
        );
      } else {
        const response = await apiPost<CustomerResponse>("/customers", form, {
          token,
        });
        setCustomers((current) => [response.customer, ...current]);
        setSelectedCustomerId(response.customer.id);
        setActivities([]);
      }
    } catch {
      setError("顧客情報の保存に失敗しました。");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeleteCustomer(customerId: string) {
    const token = window.localStorage.getItem(tokenStorageKey);
    if (!token) {
      setError("顧客を削除するにはログインしてください。");
      return;
    }

    setError(null);

    try {
      await apiDelete(`/customers/${customerId}`, { token });
      setCustomers((current) =>
        current.filter((customer) => customer.id !== customerId),
      );
      if (selectedCustomerId === customerId) {
        handleNewCustomer();
      }
    } catch {
      setError("顧客の削除に失敗しました。");
    }
  }

  async function handleCreateActivity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const token = window.localStorage.getItem(tokenStorageKey);
    if (!token || !selectedCustomerId) {
      setError("活動履歴を追加するには顧客を選択してください。");
      return;
    }
    if (!activityBody.trim()) {
      setError("活動内容を入力してください。");
      return;
    }

    setIsActivitySaving(true);
    setError(null);

    try {
      const response = await apiPost<ActivityResponse>(
        `/customers/${selectedCustomerId}/activities`,
        {
          type: activityType,
          body: activityBody,
        },
        { token },
      );
      setActivities((current) => [response.activity, ...current]);
      setActivityBody("");
    } catch {
      setError("活動履歴の追加に失敗しました。");
    } finally {
      setIsActivitySaving(false);
    }
  }

  async function handleDeleteActivity(activityId: string) {
    const token = window.localStorage.getItem(tokenStorageKey);
    if (!token) {
      setError("活動履歴を削除するにはログインしてください。");
      return;
    }

    setError(null);

    try {
      await apiDelete(`/activities/${activityId}`, { token });
      setActivities((current) =>
        current.filter((activity) => activity.id !== activityId),
      );
    } catch {
      setError("活動履歴の削除に失敗しました。");
    }
  }

  async function handleSubmitDeal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const token = window.localStorage.getItem(tokenStorageKey);
    if (!token) {
      setError("商談を保存するにはログインしてください。");
      return;
    }
    if (!dealForm.customerId) {
      setError("商談に紐づける顧客を選択してください。");
      return;
    }
    if (!dealForm.title.trim()) {
      setError("商談名を入力してください。");
      return;
    }

    setIsDealSaving(true);
    setError(null);

    const payload = {
      ...dealForm,
      amount: Number(dealForm.amount || 0),
    };

    try {
      if (selectedDealId) {
        const response = await apiPut<DealResponse>(
          `/deals/${selectedDealId}`,
          payload,
          { token },
        );
        setDeals((current) =>
          current.map((deal) =>
            deal.id === selectedDealId ? response.deal : deal,
          ),
        );
      } else {
        const response = await apiPost<DealResponse>("/deals", payload, {
          token,
        });
        setDeals((current) => [response.deal, ...current]);
        setSelectedDealId(response.deal.id);
      }
    } catch {
      setError("商談情報の保存に失敗しました。");
    } finally {
      setIsDealSaving(false);
    }
  }

  async function handleDeleteDeal(dealId: string) {
    const token = window.localStorage.getItem(tokenStorageKey);
    if (!token) {
      setError("商談を削除するにはログインしてください。");
      return;
    }

    setError(null);

    try {
      await apiDelete(`/deals/${dealId}`, { token });
      setDeals((current) => current.filter((deal) => deal.id !== dealId));
      if (selectedDealId === dealId) {
        handleNewDeal();
      }
    } catch {
      setError("商談の削除に失敗しました。");
    }
  }

  async function handleCreateTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const token = window.localStorage.getItem(tokenStorageKey);
    if (!token) {
      setError("タスクを作成するにはログインしてください。");
      return;
    }
    if (!taskTitle.trim()) {
      setError("タスク名を入力してください。");
      return;
    }

    setIsTaskSaving(true);
    setError(null);

    try {
      const response = await apiPost<TaskResponse>(
        "/tasks",
        {
          title: taskTitle,
          dueDate: getTodayDate(),
        },
        { token },
      );
      setTasks((current) => [response.task, ...current]);
      setTaskTitle("");
    } catch {
      setError("タスクの作成に失敗しました。");
    } finally {
      setIsTaskSaving(false);
    }
  }

  async function handleToggleTask(task: Task) {
    const token = window.localStorage.getItem(tokenStorageKey);
    if (!token) {
      setError("タスクを更新するにはログインしてください。");
      return;
    }

    setError(null);

    try {
      const nextStatus = task.status === "done" ? "todo" : "done";
      const response = await apiPut<TaskResponse>(
        `/tasks/${task.id}/status`,
        { status: nextStatus },
        { token },
      );
      setTasks((current) =>
        current.map((item) => (item.id === task.id ? response.task : item)),
      );
    } catch {
      setError("タスクの更新に失敗しました。");
    }
  }

  async function handleDeleteTask(taskId: string) {
    const token = window.localStorage.getItem(tokenStorageKey);
    if (!token) {
      setError("タスクを削除するにはログインしてください。");
      return;
    }

    setError(null);

    try {
      await apiDelete(`/tasks/${taskId}`, { token });
      setTasks((current) => current.filter((task) => task.id !== taskId));
    } catch {
      setError("タスクの削除に失敗しました。");
    }
  }

  const expiresAt = user?.guestExpiresAt
    ? new Intl.DateTimeFormat("ja-JP", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(user.guestExpiresAt))
    : null;

  return (
    <main className="min-h-screen bg-zinc-50 px-6 py-10 text-zinc-950">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex flex-col gap-4 border-b border-zinc-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">CRM</h1>
            {user ? (
              <p className="mt-1 text-sm text-zinc-600">
                {user.name} としてログイン中
              </p>
            ) : null}
          </div>

          {user ? (
            <button
              className="w-full rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800 transition hover:bg-zinc-100 sm:w-auto"
              type="button"
              onClick={handleLogout}
            >
              ログアウト
            </button>
          ) : (
            <button
              className="w-full rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400 sm:w-auto"
              type="button"
              onClick={handleGuestLogin}
              disabled={isLoading || isLoggingIn}
            >
              {isLoggingIn ? "ログイン中..." : "ゲストで試す"}
            </button>
          )}
        </div>

        {error ? (
          <div className="mb-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {user ? (
          <section className="mb-6 rounded-lg border border-zinc-200 bg-white p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-zinc-500">ログインユーザー</p>
                <p className="mt-1 font-medium">{user.email}</p>
              </div>
              <div className="text-sm text-zinc-600">
                権限: {user.role}
                {expiresAt ? ` / 有効期限: ${expiresAt}` : ""}
              </div>
            </div>
          </section>
        ) : null}

        <section className="mb-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-lg border border-zinc-200 bg-white p-5">
            <p className="text-sm text-zinc-500">顧客数</p>
            <p className="mt-2 text-3xl font-semibold">{customers.length}</p>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white p-5">
            <p className="text-sm text-zinc-500">商談数</p>
            <p className="mt-2 text-3xl font-semibold">{deals.length}</p>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white p-5">
            <p className="text-sm text-zinc-500">今日のタスク</p>
            <p className="mt-2 text-3xl font-semibold">{tasks.length}</p>
          </div>
        </section>

        {user ? (
          <section className="mb-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
            <div className="rounded-lg border border-zinc-200 bg-white">
              <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4">
                <h2 className="text-base font-semibold">商談一覧</h2>
                <button
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-800 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:text-zinc-400"
                  type="button"
                  onClick={handleNewDeal}
                  disabled={customers.length === 0}
                >
                  新規作成
                </button>
              </div>

              {isDealsLoading ? (
                <p className="px-5 py-6 text-sm text-zinc-500">読み込み中...</p>
              ) : deals.length === 0 ? (
                <p className="px-5 py-6 text-sm text-zinc-500">
                  まだ商談が登録されていません。
                </p>
              ) : (
                <div className="divide-y divide-zinc-200">
                  {deals.map((deal) => (
                    <button
                      className={`grid w-full gap-2 px-5 py-4 text-left transition hover:bg-zinc-50 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_110px] ${
                        selectedDealId === deal.id ? "bg-zinc-50" : ""
                      }`}
                      key={deal.id}
                      type="button"
                      onClick={() => handleSelectDeal(deal)}
                    >
                      <div>
                        <p className="font-medium">{deal.title}</p>
                        <p className="mt-1 text-sm text-zinc-500">
                          {deal.customerName}
                        </p>
                      </div>
                      <div className="text-sm text-zinc-600">
                        <p>{deal.amount.toLocaleString()} 円</p>
                        <p className="mt-1">
                          {deal.expectedCloseDate || "予定日未設定"}
                        </p>
                      </div>
                      <div>
                        <span className="inline-flex rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700">
                          {dealStatusLabels[deal.status] ?? deal.status}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <form
              className="rounded-lg border border-zinc-200 bg-white p-5"
              onSubmit={handleSubmitDeal}
            >
              <div className="mb-5 flex items-center justify-between gap-3">
                <h2 className="text-base font-semibold">
                  {selectedDeal ? "商談を編集" : "商談を作成"}
                </h2>
                {selectedDeal ? (
                  <button
                    className="rounded-md border border-red-200 px-3 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50"
                    type="button"
                    onClick={() => handleDeleteDeal(selectedDeal.id)}
                  >
                    削除
                  </button>
                ) : null}
              </div>

              {customers.length === 0 ? (
                <p className="text-sm text-zinc-500">
                  商談を作成するには先に顧客を登録してください。
                </p>
              ) : (
                <div className="space-y-4">
                  <label className="block">
                    <span className="text-sm font-medium text-zinc-700">
                      顧客
                    </span>
                    <select
                      className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none transition focus:border-zinc-600"
                      value={dealForm.customerId}
                      onChange={(event) =>
                        setDealForm((current) => ({
                          ...current,
                          customerId: event.target.value,
                        }))
                      }
                    >
                      <option value="">選択してください</option>
                      {customers.map((customer) => (
                        <option key={customer.id} value={customer.id}>
                          {customer.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="text-sm font-medium text-zinc-700">
                      商談名
                    </span>
                    <input
                      className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none transition focus:border-zinc-600"
                      value={dealForm.title}
                      onChange={(event) =>
                        setDealForm((current) => ({
                          ...current,
                          title: event.target.value,
                        }))
                      }
                    />
                  </label>

                  <label className="block">
                    <span className="text-sm font-medium text-zinc-700">
                      金額
                    </span>
                    <input
                      className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none transition focus:border-zinc-600"
                      min="0"
                      type="number"
                      value={dealForm.amount}
                      onChange={(event) =>
                        setDealForm((current) => ({
                          ...current,
                          amount: event.target.value,
                        }))
                      }
                    />
                  </label>

                  <label className="block">
                    <span className="text-sm font-medium text-zinc-700">
                      ステータス
                    </span>
                    <select
                      className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none transition focus:border-zinc-600"
                      value={dealForm.status}
                      onChange={(event) =>
                        setDealForm((current) => ({
                          ...current,
                          status: event.target.value,
                        }))
                      }
                    >
                      <option value="open">進行中</option>
                      <option value="won">受注</option>
                      <option value="lost">失注</option>
                      <option value="paused">保留</option>
                    </select>
                  </label>

                  <label className="block">
                    <span className="text-sm font-medium text-zinc-700">
                      受注予定日
                    </span>
                    <input
                      className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none transition focus:border-zinc-600"
                      type="date"
                      value={dealForm.expectedCloseDate}
                      onChange={(event) =>
                        setDealForm((current) => ({
                          ...current,
                          expectedCloseDate: event.target.value,
                        }))
                      }
                    />
                  </label>

                  <label className="block">
                    <span className="text-sm font-medium text-zinc-700">
                      メモ
                    </span>
                    <textarea
                      className="mt-1 min-h-24 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none transition focus:border-zinc-600"
                      value={dealForm.memo}
                      onChange={(event) =>
                        setDealForm((current) => ({
                          ...current,
                          memo: event.target.value,
                        }))
                      }
                    />
                  </label>
                </div>
              )}

              <button
                className="mt-5 w-full rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
                type="submit"
                disabled={isDealSaving || customers.length === 0}
              >
                {isDealSaving ? "保存中..." : "保存"}
              </button>
            </form>
          </section>
        ) : null}

        {user ? (
          <section className="mb-6 rounded-lg border border-zinc-200 bg-white">
            <div className="border-b border-zinc-200 px-5 py-4">
              <h2 className="text-base font-semibold">今日のタスク</h2>
            </div>

            <form
              className="flex flex-col gap-3 border-b border-zinc-200 px-5 py-4 sm:flex-row"
              onSubmit={handleCreateTask}
            >
              <input
                className="min-w-0 flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none transition focus:border-zinc-600"
                placeholder="今日やることを入力"
                value={taskTitle}
                onChange={(event) => setTaskTitle(event.target.value)}
              />
              <button
                className="rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
                type="submit"
                disabled={isTaskSaving}
              >
                {isTaskSaving ? "追加中..." : "追加"}
              </button>
            </form>

            {isTasksLoading ? (
              <p className="px-5 py-6 text-sm text-zinc-500">読み込み中...</p>
            ) : tasks.length === 0 ? (
              <p className="px-5 py-6 text-sm text-zinc-500">
                今日のタスクはありません。
              </p>
            ) : (
              <div className="divide-y divide-zinc-200">
                {tasks.map((task) => (
                  <div
                    className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
                    key={task.id}
                  >
                    <label className="flex min-w-0 items-center gap-3">
                      <input
                        className="size-4"
                        type="checkbox"
                        checked={task.status === "done"}
                        onChange={() => handleToggleTask(task)}
                      />
                      <span
                        className={`min-w-0 text-sm ${
                          task.status === "done"
                            ? "text-zinc-400 line-through"
                            : "text-zinc-900"
                        }`}
                      >
                        {task.title}
                      </span>
                    </label>
                    <button
                      className="self-start rounded-md border border-red-200 px-3 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50 sm:self-auto"
                      type="button"
                      onClick={() => handleDeleteTask(task.id)}
                    >
                      削除
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        ) : null}

        {user ? (
          <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
            <div className="rounded-lg border border-zinc-200 bg-white">
              <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4">
                <div>
                  <h2 className="text-base font-semibold">顧客一覧</h2>
                  <p className="mt-1 text-sm text-zinc-500">
                    {customers.length}件の顧客
                  </p>
                </div>
                <button
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-800 transition hover:bg-zinc-100"
                  type="button"
                  onClick={handleNewCustomer}
                >
                  新規作成
                </button>
              </div>

              {isCustomersLoading ? (
                <p className="px-5 py-6 text-sm text-zinc-500">読み込み中...</p>
              ) : customers.length === 0 ? (
                <p className="px-5 py-6 text-sm text-zinc-500">
                  まだ顧客が登録されていません。
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <div className="hidden min-w-[760px] grid-cols-[minmax(180px,1.1fr)_minmax(160px,1fr)_minmax(220px,1.2fr)_120px_82px] border-b border-zinc-200 bg-zinc-50 px-5 py-3 text-xs font-medium text-zinc-500 md:grid">
                    <span>顧客名</span>
                    <span>会社</span>
                    <span>連絡先</span>
                    <span>ステータス</span>
                    <span className="text-right">操作</span>
                  </div>
                  {customers.map((customer) => (
                    <button
                      className={`grid w-full min-w-0 gap-3 border-b border-zinc-100 px-5 py-4 text-left transition last:border-b-0 hover:bg-zinc-50 md:min-w-[760px] md:grid-cols-[minmax(180px,1.1fr)_minmax(160px,1fr)_minmax(220px,1.2fr)_120px_82px] md:items-center ${
                        selectedCustomerId === customer.id
                          ? "border-l-4 border-l-zinc-950 bg-zinc-50 pl-4"
                          : ""
                      }`}
                      key={customer.id}
                      type="button"
                      onClick={() => handleSelectCustomer(customer)}
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">{customer.name}</p>
                        <p className="mt-1 text-xs text-zinc-500 md:hidden">
                          {customer.company || "会社名未設定"}
                        </p>
                      </div>
                      <div className="hidden min-w-0 text-sm text-zinc-600 md:block">
                        <p className="truncate">
                          {customer.company || "会社名未設定"}
                        </p>
                      </div>
                      <div className="min-w-0 text-sm text-zinc-600">
                        <p className="truncate">
                          {customer.email || "メール未設定"}
                        </p>
                        <p className="mt-1 truncate">
                          {customer.phone || "電話未設定"}
                        </p>
                      </div>
                      <div>
                        <span className="inline-flex rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700">
                          {statusLabels[customer.status] ?? customer.status}
                        </span>
                      </div>
                      <div className="text-sm font-medium text-zinc-700 md:text-right">
                        編集
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <form
              className="rounded-lg border border-zinc-200 bg-white p-5"
              onSubmit={handleSubmit}
            >
              <div className="mb-5 flex items-center justify-between gap-3">
                <h2 className="text-base font-semibold">
                  {selectedCustomer ? "顧客を編集" : "顧客を作成"}
                </h2>
                {selectedCustomer ? (
                  <button
                    className="rounded-md border border-red-200 px-3 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50"
                    type="button"
                    onClick={() => handleDeleteCustomer(selectedCustomer.id)}
                  >
                    削除
                  </button>
                ) : null}
              </div>

              <div className="space-y-4">
                <label className="block">
                  <span className="text-sm font-medium text-zinc-700">
                    顧客名
                  </span>
                  <input
                    className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none transition focus:border-zinc-600"
                    value={form.name}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                  />
                </label>

                <label className="block">
                  <span className="text-sm font-medium text-zinc-700">
                    会社名
                  </span>
                  <input
                    className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none transition focus:border-zinc-600"
                    value={form.company}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        company: event.target.value,
                      }))
                    }
                  />
                </label>

                <label className="block">
                  <span className="text-sm font-medium text-zinc-700">
                    メール
                  </span>
                  <input
                    className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none transition focus:border-zinc-600"
                    type="email"
                    value={form.email}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        email: event.target.value,
                      }))
                    }
                  />
                </label>

                <label className="block">
                  <span className="text-sm font-medium text-zinc-700">
                    電話番号
                  </span>
                  <input
                    className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none transition focus:border-zinc-600"
                    value={form.phone}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        phone: event.target.value,
                      }))
                    }
                  />
                </label>

                <label className="block">
                  <span className="text-sm font-medium text-zinc-700">
                    ステータス
                  </span>
                  <select
                    className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none transition focus:border-zinc-600"
                    value={form.status}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        status: event.target.value,
                      }))
                    }
                  >
                    <option value="lead">見込み</option>
                    <option value="active">進行中</option>
                    <option value="paused">保留</option>
                    <option value="closed">完了</option>
                  </select>
                </label>

                <label className="block">
                  <span className="text-sm font-medium text-zinc-700">
                    メモ
                  </span>
                  <textarea
                    className="mt-1 min-h-24 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none transition focus:border-zinc-600"
                    value={form.memo}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        memo: event.target.value,
                      }))
                    }
                  />
                </label>
              </div>

              <button
                className="mt-5 w-full rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
                type="submit"
                disabled={isSaving}
              >
                {isSaving ? "保存中..." : "保存"}
              </button>
            </form>

            <div className="rounded-lg border border-zinc-200 bg-white lg:col-span-2">
              <div className="border-b border-zinc-200 px-5 py-4">
                <h2 className="text-base font-semibold">活動履歴</h2>
                <p className="mt-1 text-sm text-zinc-500">
                  {selectedCustomer
                    ? `${selectedCustomer.name} の履歴`
                    : "顧客を選択すると履歴を確認できます"}
                </p>
              </div>

              {selectedCustomer ? (
                <>
                  <form
                    className="grid gap-3 border-b border-zinc-200 px-5 py-4 md:grid-cols-[140px_minmax(0,1fr)_96px]"
                    onSubmit={handleCreateActivity}
                  >
                    <select
                      className="rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none transition focus:border-zinc-600"
                      value={activityType}
                      onChange={(event) => setActivityType(event.target.value)}
                    >
                      <option value="note">メモ</option>
                      <option value="call">電話</option>
                      <option value="email">メール</option>
                      <option value="meeting">訪問</option>
                    </select>
                    <input
                      className="min-w-0 rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none transition focus:border-zinc-600"
                      placeholder="活動内容を入力"
                      value={activityBody}
                      onChange={(event) => setActivityBody(event.target.value)}
                    />
                    <button
                      className="rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
                      type="submit"
                      disabled={isActivitySaving}
                    >
                      {isActivitySaving ? "追加中..." : "追加"}
                    </button>
                  </form>

                  {isActivitiesLoading ? (
                    <p className="px-5 py-6 text-sm text-zinc-500">
                      読み込み中...
                    </p>
                  ) : activities.length === 0 ? (
                    <p className="px-5 py-6 text-sm text-zinc-500">
                      活動履歴はまだありません。
                    </p>
                  ) : (
                    <div className="divide-y divide-zinc-200">
                      {activities.map((activity) => (
                        <div
                          className="grid gap-3 px-5 py-4 md:grid-cols-[96px_minmax(0,1fr)_160px_72px] md:items-center"
                          key={activity.id}
                        >
                          <span className="inline-flex w-fit rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700">
                            {activityTypeLabels[activity.type] ??
                              activity.type}
                          </span>
                          <p className="min-w-0 text-sm text-zinc-900">
                            {activity.body}
                          </p>
                          <p className="text-sm text-zinc-500">
                            {new Intl.DateTimeFormat("ja-JP", {
                              dateStyle: "medium",
                              timeStyle: "short",
                            }).format(new Date(activity.occurredAt))}
                          </p>
                          <button
                            className="w-fit rounded-md border border-red-200 px-3 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50 md:justify-self-end"
                            type="button"
                            onClick={() => handleDeleteActivity(activity.id)}
                          >
                            削除
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <p className="px-5 py-6 text-sm text-zinc-500">
                  左の一覧から顧客を選択してください。
                </p>
              )}
            </div>
          </section>
        ) : (
          <section className="rounded-lg border border-zinc-200 bg-white p-8 text-center">
            <p className="text-sm text-zinc-600">
              顧客管理を使うにはゲストログインしてください。
            </p>
          </section>
        )}
      </div>
    </main>
  );
}
