// Stand-in for a member's evidence photo in /preview: grid paper with handwritten work and the passphrase.
export function SamplePhoto({ passphrase }: { passphrase: string }) {
  return (
    <div
      role="img"
      aria-label="サンプルの証拠写真（方眼ノートの演習）"
      className="relative h-[200px] bg-[#fbfbf7] px-4 py-3.5 font-hand text-[0.95rem] leading-relaxed font-semibold text-[#2a3a5c]"
      style={{
        backgroundImage:
          "linear-gradient(transparent 15px, #cfd6dc 15px 16px), linear-gradient(90deg, transparent 15px, #cfd6dc 15px 16px)",
        backgroundSize: "16px 16px",
      }}
    >
      <p className="m-0">3章 固有値・固有ベクトル　演習</p>
      <p className="m-0">(1) A = [[2,1],[1,2]]</p>
      <p className="m-0">　det(A − λE) = (2−λ)² − 1 = 0　→ λ = 1, 3</p>
      <p className="m-0">(2) λ=3 のとき x = t(1, 1)</p>
      <p className="m-0">(3) P⁻¹AP = diag(1, 3)</p>
      <span className="absolute right-4 bottom-3.5 -rotate-6 rounded-full border-2 border-[#c03a2b] px-3 py-1.5 text-[1.35rem] text-[#c03a2b]">
        {passphrase}
      </span>
    </div>
  );
}
