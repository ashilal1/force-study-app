import { Avatar } from "@/components/brand/avatar";
import { cn } from "@/lib/utils";

/**
 * Pick between the Google photo and the first-letter avatar. Only the choice is submitted;
 * the server takes the photo URL from the session, so a form can't point it anywhere else.
 */
export function AvatarChoice({
  name,
  googleAvatarUrl,
  defaultChoice,
}: {
  name: string;
  googleAvatarUrl: string | null;
  defaultChoice: "google" | "initial";
}) {
  if (!googleAvatarUrl) return <input type="hidden" name="avatar" value="initial" />;

  const options = [
    { value: "google", label: "Google の写真", src: googleAvatarUrl },
    { value: "initial", label: "頭文字", src: null },
  ] as const;

  return (
    <fieldset className="m-0 grid gap-1.5 border-0 p-0">
      <legend className="mb-1.5 font-sans text-base font-black">アイコン</legend>
      <div className="grid grid-cols-2 gap-3">
        {options.map((option) => (
          <label
            key={option.value}
            className={cn(
              "th-choice flex cursor-pointer items-center gap-2.5 rounded-[14px] border-[3px] border-ink bg-card px-3 py-2.5 shadow-hard-sm",
              "has-checked:bg-mint has-focus-visible:outline-[3px] has-focus-visible:outline-offset-2",
            )}
          >
            <input
              type="radio"
              name="avatar"
              value={option.value}
              defaultChecked={defaultChoice === option.value}
              className="sr-only"
            />
            <Avatar name={name || "?"} src={option.src} />
            <span className="text-sm font-bold">{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
