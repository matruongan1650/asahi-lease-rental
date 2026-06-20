import React, { useEffect, useRef, useState } from "react";
import type { BrowserQRCodeReader, IScannerControls } from "@zxing/browser";
import Icon from "./Icon";
import { Btn, Sheet } from "./StaffUI";
import { findProductByQr } from "../../utils/productQr";

type ScanState = "idle" | "camera" | "manual" | "matched" | "error";

interface ProductQrScannerProps {
  open: boolean;
  title: string;
  products: any[];
  onClose: () => void;
  onMatch: (product: any, rawValue: string) => void;
  description?: string;
}

export default function ProductQrScanner({ open, title, products, onClose, onMatch, description }: ProductQrScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const readerRef = useRef<BrowserQRCodeReader | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const scanLockedRef = useRef(false);
  // 起動世代トークン。非同期起動の途中で閉じ/アンマウントされた場合に、後から解決した
  // カメラセッションを確実に停止する（StrictMode の mount/unmount/remount や即閉じでのカメラ/ストリーム漏れ防止）。
  const startGenRef = useRef(0);
  // 最新の products を保持。decode コールバックは起動時点の products を握るため、
  // 起動後に products が読み込まれた商品をスキャンすると誤って「見つかりません」になるのを防ぐ。
  const productsRef = useRef(products);
  const [state, setState] = useState<ScanState>("idle");
  const [manual, setManual] = useState("");
  const [message, setMessage] = useState("");
  // 暗い倉庫・夕暮れの現場で印刷QRを読むためのライト（端末が対応する場合のみ表示）。
  const [torchOn, setTorchOn] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);

  const stopCamera = () => {
    startGenRef.current++; // 進行中の startCamera を無効化する
    controlsRef.current?.stop();
    controlsRef.current = null;
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    scanLockedRef.current = false;
    setTorchOn(false);
    setTorchAvailable(false);
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks?.()[0];
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as any] });
      setTorchOn(next);
    } catch { /* 端末がライト制御に未対応 */ }
  };

  const matchValue = (rawValue: string) => {
    const product = findProductByQr(productsRef.current, rawValue);
    if (!product) {
      setMessage("対象の商品が見つかりません。注文または棚卸リストの商品QRを確認してください。");
      setState("manual");
      // スキャンロックを解除してライブ読取を継続できるようにする
      // （未登録QRを1回読むとカメラが固まる不具合の修正）。
      scanLockedRef.current = false;
      return false;
    }
    setState("matched");
    setMessage("");
    stopCamera();
    onMatch(product, rawValue);
    return true;
  };

  const startCamera = async () => {
    setMessage("");
    scanLockedRef.current = false;

    if (!navigator.mediaDevices?.getUserMedia) {
      setState("manual");
      setMessage("この端末ではカメラQR読取が未対応です。QRコードの文字を入力してください。");
      return;
    }

    try {
      setState("camera");
      stopCamera();
      const myGen = startGenRef.current; // stopCamera が世代を進めた後の現世代を確保
      await new Promise(resolve => requestAnimationFrame(resolve));
      if (myGen !== startGenRef.current) return; // 起動待ちの間に閉じられた

      const video = videoRef.current;
      if (!video) {
        setState("manual");
        setMessage("カメラ画面を準備できませんでした。QRコードを手入力してください。");
        return;
      }

      const { BrowserQRCodeReader } = await import("@zxing/browser");
      if (myGen !== startGenRef.current) return;
      readerRef.current ||= new BrowserQRCodeReader();
      const controls = await readerRef.current.decodeFromConstraints(
        {
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        },
        video,
        result => {
          const value = result?.getText?.() || "";
          if (!value || scanLockedRef.current) return;
          scanLockedRef.current = true;
          matchValue(value);
        }
      );
      // カメラが実際に開く decodeFromConstraints の解決後に閉じられていたら、保持せず即停止する（リーク防止）。
      if (myGen !== startGenRef.current) {
        try { controls.stop(); } catch { /* ignore */ }
        const leaked = video.srcObject as MediaStream | null;
        leaked?.getTracks().forEach(track => track.stop());
        video.srcObject = null;
        return;
      }
      controlsRef.current = controls;
      streamRef.current = (video.srcObject as MediaStream | null) || null;
      // ライト(torch)対応端末ならトグルを出す。
      try {
        const track = streamRef.current?.getVideoTracks?.()[0];
        const caps = track?.getCapabilities?.() as any;
        setTorchAvailable(!!(caps && "torch" in caps && caps.torch));
      } catch { setTorchAvailable(false); }
    } catch {
      stopCamera();
      setState("manual");
      setMessage("カメラを起動できません。端末のカメラ権限を確認するか、QRコードを手入力してください。");
    }
  };

  // decode コールバックが常に最新の products で照合できるよう ref を同期する。
  useEffect(() => { productsRef.current = products; }, [products]);

  useEffect(() => {
    if (!open) {
      stopCamera();
      setManual("");
      setMessage("");
      setState("idle");
      return;
    }
    startCamera();
    return stopCamera;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const submitManual = () => {
    if (!manual.trim()) {
      setMessage("QRコードを入力してください。");
      setState("manual");
      return;
    }
    matchValue(manual.trim());
  };

  return (
    <Sheet open={open} onClose={() => { stopCamera(); onClose(); }} title={title}>
      <div style={{ display: "grid", gap: 14 }}>
        <div style={{ position: "relative", height: 220, borderRadius: 18, overflow: "hidden", background: "#0a0d14", border: "1px solid var(--border)" }}>
          <video ref={videoRef} muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover", opacity: state === "camera" ? 1 : 0 }} />
          {state !== "camera" && (
            <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "rgba(255,255,255,.78)" }}>
              <Icon name="qr" size={76} />
            </div>
          )}
          <div style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)", width: 142, height: 142 }}>
            {[["0","0","auto","auto"],["0","auto","auto","0"],["auto","0","0","auto"],["auto","auto","0","0"]].map((corner, index) => (
              <span key={index} style={{
                position: "absolute",
                top: corner[0],
                right: corner[1],
                bottom: corner[2],
                left: corner[3],
                width: 28,
                height: 28,
                borderTop: corner[0] === "0" ? "3px solid var(--brand-accent)" : "none",
                borderBottom: corner[2] === "0" ? "3px solid var(--brand-accent)" : "none",
                borderLeft: corner[3] === "0" ? "3px solid var(--brand-accent)" : "none",
                borderRight: corner[1] === "0" ? "3px solid var(--brand-accent)" : "none",
                borderRadius: 4,
              }} />
            ))}
            {state === "camera" && <div style={{ position: "absolute", left: 8, right: 8, height: 2, background: "var(--brand-accent)", boxShadow: "0 0 10px var(--brand-accent)", borderRadius: 2, animation: "scanline 2s ease-in-out infinite" }} />}
          </div>
        </div>

        {description && <p style={{ margin: 0, fontSize: 13, color: "var(--fg-muted)", lineHeight: 1.55, fontWeight: 700 }}>{description}</p>}
        {message && <div style={{ padding: 12, borderRadius: 13, background: "var(--warning-tint)", border: "1px solid var(--warning-bright)", color: "var(--fg)", fontSize: 13, fontWeight: 800, lineHeight: 1.5 }}>{message}</div>}

        <div style={{ display: "grid", gap: 9 }}>
          <input
            value={manual}
            onChange={event => setManual(event.target.value)}
            placeholder="QRコード / 商品IDを入力"
            inputMode="text"
            style={{ width: "100%", boxSizing: "border-box", border: "1px solid var(--border-2)", borderRadius: 14, padding: "12px 13px", fontSize: 15, fontWeight: 800, color: "var(--fg)", background: "var(--surface)", fontFamily: "var(--font-mono)" }}
          />
          <div style={{ display: "flex", gap: 10 }}>
            <Btn variant="secondary" icon="camera" onClick={startCamera}>カメラ</Btn>
            {torchAvailable && <Btn variant={torchOn ? "primary" : "secondary"} icon="sun" onClick={toggleTorch}>{torchOn ? "ライト消灯" : "ライト点灯"}</Btn>}
            <Btn full icon="scan" onClick={submitManual}>照合</Btn>
          </div>
        </div>
      </div>
    </Sheet>
  );
}
