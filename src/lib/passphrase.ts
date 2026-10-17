import "server-only";
import { randomInt } from "node:crypto";

// Today's passphrase (F4a): a word plus a two-digit number, e.g. "さくら 47". Written by hand on
// paper and photographed, so the words are short, common and easy to read in hiragana.
const WORDS = [
  "あさがお", "あじさい", "いちご", "いるか", "うさぎ", "うちわ", "えんぴつ", "おにぎり", "かえる", "かがみ",
  "かさ", "かぼちゃ", "かもめ", "きつね", "きのこ", "くじら", "くるみ", "けしごむ", "こあら", "こけし",
  "さくら", "さかな", "さんご", "しまうま", "すいか", "すずめ", "せみ", "そらまめ", "たいこ", "たぬき",
  "たまご", "ちくわ", "つばめ", "つみき", "とけい", "とまと", "どんぐり", "なすび", "にんじん", "ねこ",
  "のりまき", "はさみ", "はちみつ", "ひまわり", "ひよこ", "ふうせん", "ぶどう", "へちま", "ほたる", "まくら",
  "まつぼっくり", "みかん", "みのむし", "むぎちゃ", "めだか", "もみじ", "やかん", "ゆきだるま", "よもぎ", "らっぱ",
  "りんご", "れもん", "ろうそく", "わかめ", "わたあめ",
] as const;

export function generatePassphrase(): string {
  return `${WORDS[randomInt(WORDS.length)]} ${randomInt(10, 100)}`;
}
