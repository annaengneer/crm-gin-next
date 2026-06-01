"use client";

import { useEffect, useState } from "react";

import { apiGet, apiPost } from "@/lib/api";

type User = {
  id: string;
  name: string;
  email: string;
  role: string;
  isGuest: boolean;
  guestExpiresAt: string | null;
};

type AuthResponse = {
  accessToken: string;
  user: User;
};

type MeResponse = {
  user: User;
};

const tokenStorageKey = "crm_access_token";

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const storedToken = window.localStorage.getItem(tokenStorageKey);
    if (!storedToken) {
      setIsLoading(false);
      return;
    }

    apiGet<MeResponse>("/auth/me", { token: storedToken })
      .then((response) => {
        setUser(response.user);
      })
      .catch(() => {
        window.localStorage.removeItem(tokenStorageKey);
        setUser(null);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  async function handleGuestLogin() {
    setIsLoggingIn(true);
    setError(null);

    try {
      const response = await apiPost<AuthResponse>("/auth/guest");
      window.localStorage.setItem(tokenStorageKey, response.accessToken);
      setUser(response.user);
    } catch {
      setError("ゲストログインに失敗しました。時間をおいて再度お試しください。");
    } finally {
      setIsLoggingIn(false);
    }
  }

  function handleLogout() {
    window.localStorage.removeItem(tokenStorageKey);
    setUser(null);
    setError(null);
  }

  const expiresAt = user?.guestExpiresAt
    ? new Intl.DateTimeFormat("ja-JP", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(user.guestExpiresAt))
    : null;

  return (
    <main className="min-h-screen bg-zinc-50 px-6 py-10 text-zinc-950">
      <div className="mx-auto max-w-5xl">
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

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-lg border border-zinc-200 bg-white p-5">
            <p className="text-sm text-zinc-500">顧客数</p>
            <p className="mt-2 text-3xl font-semibold">0</p>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white p-5">
            <p className="text-sm text-zinc-500">商談数</p>
            <p className="mt-2 text-3xl font-semibold">0</p>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white p-5">
            <p className="text-sm text-zinc-500">今週のタスク</p>
            <p className="mt-2 text-3xl font-semibold">0</p>
          </div>
        </section>
      </div>
    </main>
  );
}
