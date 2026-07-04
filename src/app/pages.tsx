interface Page {
  title: string;
  description: string;
  eyebrow: string;
}

const PagePanel = ({ title, description, eyebrow }: Page) => (
  <section className="mx-auto flex min-h-[calc(100dvh-10rem)] w-full max-w-3xl flex-col justify-center gap-4 px-5 py-10 md:min-h-[calc(100dvh-4rem)]">
    <p className="text-sm font-medium text-indigo-700">{eyebrow}</p>
    <h1 className="text-3xl font-semibold tracking-normal text-zinc-950 md:text-4xl">{title}</h1>
    <p className="max-w-2xl text-base leading-7 text-zinc-700">{description}</p>
  </section>
);

export const HomePage = () => (
  <PagePanel
    eyebrow="Home"
    title="今日の条文へ進む"
    description="最近開いた条文、保存済み法令、今日の復習へ戻るための入口です。"
  />
);

export const LawsPage = () => (
  <PagePanel
    eyebrow="Laws"
    title="法令を探す"
    description="法令名、略称、法令番号から目的の法令へ進むための入口です。"
  />
);

export const JumpPage = () => (
  <PagePanel
    eyebrow="Jump"
    title="条文参照を開く"
    description="国賠法1条や民709のような参照表記を入力して、該当条文へ進むための入口です。"
  />
);

export const ScannerPage = () => (
  <PagePanel
    eyebrow="Scanner"
    title="条文参照を撮る"
    description="画像やカメラから条文参照を検出する将来機能の入口です。"
  />
);

export const StudyPage = () => (
  <PagePanel
    eyebrow="Study"
    title="復習を始める"
    description="保存した条文や苦手な論点を復習するための入口です。"
  />
);

export const SettingsPage = () => (
  <PagePanel
    eyebrow="Settings"
    title="設定を調整する"
    description="表示、基準日、オフライン保存、学習設定を調整するための入口です。"
  />
);
