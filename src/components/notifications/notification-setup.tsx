"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { confirmNotifications, savePushSubscription, sendTestNotification } from "@/actions/notifications";
import { ActionButton } from "@/components/brand/action-button";
import { Sticker } from "@/components/brand/sticker";
import { FieldError } from "@/components/form/submit-button";
import { TEST_PUSH_DELAY_SECONDS } from "@/lib/notify/constants";
import { SettingsGuide } from "./settings-guide";
import {
  currentSubscription,
  detectPlatform,
  isStandalone,
  pushSupported,
  subscribe,
  type Platform,
} from "@/lib/push-client";

// Notification gate (F0): home screen (iOS) -> permission -> subscription -> test notification ->
// the member confirms the banner popped up with sound. The app stays locked until then.

type Step = "checking" | "unsupported" | "install" | "ask" | "denied" | "test" | "sent";

export function NotificationSetup({ vapidPublicKey }: { vapidPublicKey: string | null }) {
  const router = useRouter();
  const [platform, setPlatform] = useState<Platform>("other");
  const [step, setStep] = useState<Step>("checking");
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  // Registers this browser's subscription and moves on to the test notification.
  async function register() {
    if (!vapidPublicKey) {
      setError("通知の設定がサーバーにありません。管理者に連絡してください");
      return;
    }
    const subscription = await subscribe(vapidPublicKey);
    const result = await savePushSubscription(subscription.toJSON(), navigator.userAgent);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setEndpoint(subscription.endpoint);
    setStep("test");
  }

  useEffect(() => {
    const detected = detectPlatform();
    // Browser capabilities are only known after mount; this sets the first real step once.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPlatform(detected);
    if (detected === "ios" && !isStandalone()) return setStep("install");
    if (!pushSupported()) return setStep("unsupported");
    if (Notification.permission === "denied") return setStep("denied");
    if (Notification.permission === "default") return setStep("ask");
    startTransition(async () => {
      try {
        await register();
      } catch {
        setError("この端末の通知の登録に失敗しました。ページを開き直してください");
        setStep("ask");
      }
    });
    // Runs once per visit; register only reads props that don't change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function allow() {
    setError(undefined);
    startTransition(async () => {
      // iOS only shows the prompt from a tap, which is why this is a button and not automatic.
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return setStep(permission === "denied" ? "denied" : "ask");
      try {
        await register();
      } catch {
        setError("この端末の通知の登録に失敗しました。もう一度試してください");
      }
    });
  }

  function sendTest() {
    if (!endpoint) return;
    setError(undefined);
    startTransition(async () => {
      const result = await sendTestNotification(endpoint);
      if (!result.ok) return setError(result.message);
      setStep("sent");
    });
  }

  function confirm() {
    if (!endpoint) return;
    setError(undefined);
    startTransition(async () => {
      // Make sure the subscription we registered is still the one this browser holds.
      const live = await currentSubscription();
      if (live?.endpoint !== endpoint) {
        setError("この端末の登録が変わりました。もう一度テスト通知を送ってください");
        return setStep("ask");
      }
      const result = await confirmNotifications(endpoint);
      if (!result.ok) return setError(result.message);
      router.replace("/");
      router.refresh();
    });
  }

  return (
    <div className="grid gap-4">
      <StepCard title="通知を ON にしないと使えません">
        宣言・提出・審査の締切は通知で知らせます。見逃さないように、バナー（ポップアップ）と音の両方で届く状態にしてください。
      </StepCard>

      {step === "checking" ? <p className="m-0 text-center text-sm text-sub">確認中…</p> : null}

      {step === "unsupported" ? (
        <StepCard title="このブラウザでは通知を受け取れません" tone="red">
          Chrome・Edge・Firefox・Safari の新しいバージョンで開いてください。
        </StepCard>
      ) : null}

      {step === "install" ? (
        <StepCard title="1. ホーム画面に追加する">
          iPhone では、ホーム画面に追加したアプリにだけ通知が届きます。
          <ol className="m-0 mt-2 grid gap-1 pl-5">
            <li>Safari の下にある共有ボタン（四角から矢印が出たアイコン）を押す</li>
            <li>「ホーム画面に追加」を押し、「Web アプリとして開く」がオンのまま「追加」を押す</li>
            <li>ホーム画面にできた Commit or Treat のアイコンから開き直す</li>
          </ol>
        </StepCard>
      ) : null}

      {step === "ask" ? (
        <>
          <StepCard title="2. 通知を許可する">次に出る確認で「許可」を選んでください。</StepCard>
          <ActionButton type="button" onClick={allow} disabled={pending}>
            {pending ? "確認中…" : "通知を許可する"}
          </ActionButton>
        </>
      ) : null}

      {step === "denied" ? (
        <>
          <StepCard title="通知がブロックされています" tone="red">
            下の手順で通知を許可してから、このページを開き直してください。
          </StepCard>
          <SettingsGuide platform={platform} focus="unblock" />
        </>
      ) : null}

      {step === "test" ? (
        <>
          <StepCard title="3. テスト通知を送る">
            押してから {TEST_PUSH_DELAY_SECONDS} 秒後に届きます。押したらすぐ
            {platform === "ios" || platform === "android" ? "画面を閉じて（ロックして）" : "ほかのアプリに切り替えて"}
            、バナーが出て音が鳴るか確かめてください。アプリを見たままだと、音やバナーが出ない端末があります。
          </StepCard>
          <ActionButton type="button" onClick={sendTest} disabled={pending}>
            {pending ? "送信中…" : `テスト通知を送る（${TEST_PUSH_DELAY_SECONDS} 秒後に届く）`}
          </ActionButton>
        </>
      ) : null}

      {step === "sent" ? (
        <>
          <StepCard title="4. バナーと音を確かめる">
            テスト通知を送りました（{TEST_PUSH_DELAY_SECONDS} 秒後に届きます）。バナーが出なかった、または音が鳴らなかったときは、下の手順で端末の設定を直してから、もう一度送ってください。音を鳴らすかどうかは端末の設定で決まり、アプリからは変えられません。
          </StepCard>
          <SettingsGuide platform={platform} focus="sound" />
          <ActionButton type="button" onClick={confirm} disabled={pending}>
            {pending ? "記録中…" : "表示され、音も鳴った"}
          </ActionButton>
          <ActionButton type="button" tone="white" onClick={sendTest} disabled={pending}>
            届かなかったので、もう一度送る（{TEST_PUSH_DELAY_SECONDS} 秒後）
          </ActionButton>
        </>
      ) : null}

      <FieldError id="setup-error" message={error} />
    </div>
  );
}

function StepCard({
  title,
  tone = "white",
  children,
}: {
  title: string;
  tone?: "white" | "red";
  children: React.ReactNode;
}) {
  return (
    <Sticker shadow="sm" className={tone === "red" ? "grid gap-1 border-red px-4 py-3" : "grid gap-1 px-4 py-3"}>
      <b className={tone === "red" ? "text-red" : undefined}>{title}</b>
      <div className="text-sm leading-relaxed font-medium">{children}</div>
    </Sticker>
  );
}
