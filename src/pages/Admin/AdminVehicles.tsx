import React, { useState, useEffect } from "react";
import {
  Panel,
  Btn,
  Toolbar,
  Table,
  Badge,
  Modal,
  Drawer,
  Field,
  TextInput,
  SelectInput,
  Row,
  FormSection,
  triggerToast
} from "../../components/AdminUI";
import { useVehicles, VehicleDetail } from "../../context/VehicleContext";

export default function AdminVehicles() {
  const { vehicles, addVehicle, updateVehicle } = useVehicles();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Selected vehicle for Drawer
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleDetail | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<Partial<VehicleDetail>>({});

  // Form states (Add Modal)
  const [newName, setNewName] = useState("軽トラック");
  const [newPlate, setNewPlate] = useState("");
  const [newCat, setNewCat] = useState("軽トラック");
  const [newMileage, setNewMileage] = useState("0 km");
  const [newStatus, setNewStatus] = useState<"空車" | "使用中" | "整備中">("空車");

  useEffect(() => {
    if (selectedVehicle) {
      setEditForm(selectedVehicle);
    }
  }, [selectedVehicle]);

  const handleSaveItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlate.trim()) {
      triggerToast("ナンバープレートを入力してください", "warn");
      return;
    }

    const newId = "V-" + Math.floor(1000 + Math.random() * 9000);
    const newVehicle: VehicleDetail = {
      id: newId,
      productId: "P-" + newId,
      name: newName,
      plate: newPlate,
      category: newCat,
      status: newStatus,
      statusColor: newStatus === "空車" ? "blue" : newStatus === "使用中" ? "emerald" : "orange",
      inspectionDate: "2027/01/01",
      inspectionDaysRemaining: 365,
      insuranceDate: "2027/01/01",
      manufacturer: "スズキ",
      year: "2025年",
      color: "ホワイト",
      vin: "DA16T-" + Math.floor(100000 + Math.random() * 900000),
      engineModel: "R06A",
      purchaseDate: "2025/01/01",
      purchasePrice: "¥1,200,000",
      mileage: newMileage,
      maintenanceDesc: "新規登録",
      maintenanceDate: "2025/07/01",
      alerts: [],
      maintenanceHistory: [],
      repairHistory: [],
      documents: ["車検証"],
      photos: []
    };

    addVehicle(newVehicle);
    triggerToast(`車両 ${newPlate} を登録しました`, "ok");
    setIsAddModalOpen(false);
    setNewPlate("");
  };

  const handleUpdateVehicle = () => {
    if (!selectedVehicle) return;
    updateVehicle(selectedVehicle.id, {
      ...editForm,
      statusColor: editForm.status === "空車" ? "blue" : editForm.status === "使用中" ? "emerald" : "orange",
    });
    triggerToast(`車両 ${editForm.plate} を更新しました`, "ok");
    setIsEditing(false);
    
    // Update local state to reflect immediately
    setSelectedVehicle(prev => prev ? { ...prev, ...editForm, statusColor: editForm.status === "空車" ? "blue" : editForm.status === "使用中" ? "emerald" : "orange" } : null);
  };

  const cols = [
    {
      h: "車両 / ナンバー",
      wrap: true,
      cell: (r: VehicleDetail) => (
        <div>
          <div className="font-bold text-slate-800">{r.name}</div>
          <div className="font-mono text-[11px] text-slate-500 font-bold bg-slate-100 px-1.5 py-0.5 rounded inline-block mt-1">
            {r.plate}
          </div>
        </div>
      )
    },
    {
      h: "カテゴリー",
      cell: (r: VehicleDetail) => <span className="text-sm font-medium text-slate-600">{r.category}</span>
    },
    {
      h: "メーカー",
      cell: (r: VehicleDetail) => <span className="text-sm text-slate-500">{r.manufacturer}</span>
    },
    {
      h: "走行距離",
      align: "right" as const,
      cell: (r: VehicleDetail) => <span className="font-mono font-semibold text-slate-700">{r.mileage}</span>
    },
    {
      h: "車検満了日",
      cell: (r: VehicleDetail) => {
        const isWarning = r.inspectionDaysRemaining < 30;
        return (
          <div className="flex flex-col">
            <span className={`font-mono text-sm font-bold ${isWarning ? 'text-red-600' : 'text-slate-700'}`}>
              {r.inspectionDate}
            </span>
            {isWarning && <span className="text-[10px] text-red-500 font-bold mt-0.5">残り{r.inspectionDaysRemaining}日</span>}
          </div>
        );
      }
    },
    {
      h: "ステータス",
      align: "center" as const,
      cell: (r: VehicleDetail) => (
        <Badge
          tone={r.statusColor === "emerald" ? "ok" : r.statusColor === "blue" ? "default" : "warning"}
        >
          {r.status}
        </Badge>
      )
    }
  ];

  return (
    <div className="space-y-6">
      {/* Metrics Header */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400 font-semibold">総車両数</p>
            <h4 className="text-2xl font-black text-slate-800 mt-1 font-mono">
              {vehicles.length}
            </h4>
          </div>
          <span className="material-symbols-outlined text-[32px] text-blue-100">directions_car</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400 font-semibold">稼働中（使用中）</p>
            <h4 className="text-2xl font-black text-emerald-600 mt-1 font-mono">
              {vehicles.filter(v => v.status === "使用中").length}
            </h4>
          </div>
          <span className="material-symbols-outlined text-[32px] text-emerald-100">sync</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400 font-semibold">空車（待機）</p>
            <h4 className="text-2xl font-black text-blue-600 mt-1 font-mono">
              {vehicles.filter(v => v.status === "空車").length}
            </h4>
          </div>
          <span className="material-symbols-outlined text-[32px] text-blue-100">local_parking</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400 font-semibold">整備中</p>
            <h4 className="text-2xl font-black text-orange-600 mt-1 font-mono">
              {vehicles.filter(v => v.status === "整備中").length}
            </h4>
          </div>
          <span className="material-symbols-outlined text-[32px] text-orange-100">build</span>
        </div>
      </div>

      <Toolbar
        right={
          <Btn icon="add" variant="primary" onClick={() => setIsAddModalOpen(true)}>
            車両を登録
          </Btn>
        }
      >
        <div className="flex gap-2">
          <Btn size="sm" icon="filter_list" variant="ghost">フィルター</Btn>
          <Btn size="sm" icon="calendar_today" variant="ghost">車検カレンダー</Btn>
        </div>
      </Toolbar>

      <Panel title="車両・車庫管理" icon="directions_car">
        <Table cols={cols} rows={vehicles} onRow={setSelectedVehicle} />
      </Panel>

      {/* Vehicle Details Drawer */}
      <Drawer
        open={!!selectedVehicle}
        onClose={() => { setSelectedVehicle(null); setIsEditing(false); }}
        title="車両詳細"
        sub={selectedVehicle?.plate}
        width={700}
        footer={
          isEditing ? (
            <>
              <Btn variant="ghost" onClick={() => setIsEditing(false)}>キャンセル</Btn>
              <Btn variant="primary" icon="check" onClick={handleUpdateVehicle}>保存する</Btn>
            </>
          ) : (
            <Btn variant="primary" icon="edit" onClick={() => setIsEditing(true)}>編集する</Btn>
          )
        }
      >
        {selectedVehicle && (
          <div className="space-y-6">
            {!isEditing ? (
              // Read-only View
              <>
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-16 h-16 bg-slate-100 rounded-xl flex items-center justify-center text-slate-400">
                    <span className="material-symbols-outlined text-[32px]">directions_car</span>
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-800">{selectedVehicle.name}</h2>
                    <p className="text-sm text-slate-500 font-mono mt-1">{selectedVehicle.plate}</p>
                    <div className="mt-2">
                      <Badge tone={selectedVehicle.statusColor === "emerald" ? "ok" : selectedVehicle.statusColor === "blue" ? "default" : "warning"}>
                        {selectedVehicle.status}
                      </Badge>
                    </div>
                  </div>
                </div>

                <FormSection title="基本情報">
                  <div className="grid grid-cols-2 gap-y-4 gap-x-6">
                    <div>
                      <div className="text-xs text-slate-400 font-bold mb-1">メーカー</div>
                      <div className="text-sm font-semibold text-slate-800">{selectedVehicle.manufacturer}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400 font-bold mb-1">年式</div>
                      <div className="text-sm font-semibold text-slate-800">{selectedVehicle.year}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400 font-bold mb-1">車台番号 (VIN)</div>
                      <div className="text-sm font-semibold text-slate-800 font-mono">{selectedVehicle.vin}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400 font-bold mb-1">走行距離</div>
                      <div className="text-sm font-semibold text-slate-800 font-mono">{selectedVehicle.mileage}</div>
                    </div>
                  </div>
                </FormSection>

                <FormSection title="法定・保険情報">
                  <div className="grid grid-cols-2 gap-y-4 gap-x-6">
                    <div>
                      <div className="text-xs text-slate-400 font-bold mb-1">車検満了日</div>
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-semibold text-slate-800 font-mono">{selectedVehicle.inspectionDate}</div>
                        <Badge tone={selectedVehicle.inspectionDaysRemaining < 30 ? "danger" : "default"}>残り{selectedVehicle.inspectionDaysRemaining}日</Badge>
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400 font-bold mb-1">自賠責保険</div>
                      <div className="text-sm font-semibold text-slate-800 font-mono">{selectedVehicle.insuranceDate}</div>
                    </div>
                  </div>
                </FormSection>

                <FormSection title="添付ファイル・画像">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-xs text-slate-400 font-bold mb-2">ドキュメント</div>
                      {selectedVehicle.documents.length > 0 ? (
                        <div className="space-y-2">
                          {selectedVehicle.documents.map((doc, idx) => (
                            <div key={idx} className="flex items-center gap-2 p-2 bg-slate-50 border border-slate-100 rounded-lg">
                              <span className="material-symbols-outlined text-[18px] text-slate-400">description</span>
                              <span className="text-xs font-semibold text-slate-700 truncate">{doc}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-xs text-slate-500 italic">なし</div>
                      )}
                    </div>
                    <div>
                      <div className="text-xs text-slate-400 font-bold mb-2">画像</div>
                      {selectedVehicle.photos && selectedVehicle.photos.length > 0 ? (
                        <div className="grid grid-cols-2 gap-2">
                          {selectedVehicle.photos.map((photo, idx) => (
                            <div key={idx} className="aspect-square bg-slate-100 rounded-lg flex items-center justify-center relative overflow-hidden border border-slate-200">
                              <img src={photo.startsWith("http") ? photo : `https://placehold.co/400x400/e2e8f0/64748b?text=Image`} alt="Vehicle" className="object-cover w-full h-full" />
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-xs text-slate-500 italic">なし</div>
                      )}
                    </div>
                  </div>
                </FormSection>

                <FormSection title="メンテナンス・修理履歴">
                  {selectedVehicle.maintenanceHistory.length > 0 ? (
                    <div className="border border-slate-200 rounded-lg overflow-hidden">
                      {selectedVehicle.maintenanceHistory.map((m, i) => (
                        <div key={i} className="flex justify-between items-center p-3 border-b border-slate-100 last:border-0 bg-slate-50/50">
                          <div>
                            <div className="text-xs font-bold text-slate-800">{m.item}</div>
                            <div className="text-[10px] text-slate-500 font-mono mt-0.5">{m.date}</div>
                          </div>
                          <div className="text-xs font-bold text-slate-600 font-mono bg-white px-2 py-1 rounded shadow-sm border border-slate-200">
                            {m.mileage}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-slate-500 italic">履歴はありません</div>
                  )}
                </FormSection>
              </>
            ) : (
              // Edit Form
              <div className="space-y-6">
                <FormSection title="基本情報">
                  <Row>
                    <Field label="車両名">
                      <TextInput value={editForm.name || ""} onChange={e => setEditForm({...editForm, name: e.target.value})} />
                    </Field>
                    <Field label="ナンバープレート">
                      <TextInput value={editForm.plate || ""} onChange={e => setEditForm({...editForm, plate: e.target.value})} />
                    </Field>
                  </Row>
                  <Row>
                    <Field label="カテゴリー">
                      <SelectInput value={editForm.category || ""} onChange={e => setEditForm({...editForm, category: e.target.value})} options={["軽トラック", "軽バン", "2tトラック", "3tダンプ", "高所作業車"]} />
                    </Field>
                    <Field label="ステータス">
                      <SelectInput value={editForm.status || "空車"} onChange={e => setEditForm({...editForm, status: e.target.value as any})} options={["空車", "使用中", "整備中"]} />
                    </Field>
                  </Row>
                  <Row>
                    <Field label="メーカー">
                      <TextInput value={editForm.manufacturer || ""} onChange={e => setEditForm({...editForm, manufacturer: e.target.value})} />
                    </Field>
                    <Field label="走行距離">
                      <TextInput value={editForm.mileage || ""} onChange={e => setEditForm({...editForm, mileage: e.target.value})} />
                    </Field>
                  </Row>
                  <Row>
                    <Field label="車台番号 (VIN)">
                      <TextInput value={editForm.vin || ""} onChange={e => setEditForm({...editForm, vin: e.target.value})} />
                    </Field>
                    <Field label="年式">
                      <TextInput value={editForm.year || ""} onChange={e => setEditForm({...editForm, year: e.target.value})} />
                    </Field>
                  </Row>
                </FormSection>

                <FormSection title="法定・保険情報">
                  <Row>
                    <Field label="車検満了日">
                      <TextInput type="date" value={(editForm.inspectionDate || "").replace(/\//g, "-")} onChange={e => setEditForm({...editForm, inspectionDate: e.target.value.replace(/-/g, "/")})} />
                    </Field>
                    <Field label="自賠責保険 期限">
                      <TextInput type="date" value={(editForm.insuranceDate || "").replace(/\//g, "-")} onChange={e => setEditForm({...editForm, insuranceDate: e.target.value.replace(/-/g, "/")})} />
                    </Field>
                  </Row>
                </FormSection>

                <FormSection title="添付ファイル・画像">
                  <div className="space-y-4">
                    <Field label="ドキュメント">
                      <div className="space-y-2 mb-2">
                        {(editForm.documents || []).map((doc, i) => (
                          <div key={i} className="flex gap-2">
                            <TextInput value={doc} onChange={e => {
                              const newDocs = [...(editForm.documents || [])];
                              newDocs[i] = e.target.value;
                              setEditForm({...editForm, documents: newDocs});
                            }} />
                            <Btn variant="danger" icon="delete" onClick={() => {
                              const newDocs = (editForm.documents || []).filter((_, idx) => idx !== i);
                              setEditForm({...editForm, documents: newDocs});
                            }} />
                          </div>
                        ))}
                      </div>
                      <Btn size="sm" icon="add" onClick={() => setEditForm({...editForm, documents: [...(editForm.documents || []), "新規ファイル.pdf"]})}>ファイルを追加</Btn>
                    </Field>

                    <Field label="車両画像 (URL)">
                      <div className="space-y-2 mb-2">
                        {(editForm.photos || []).map((photo, i) => (
                          <div key={i} className="flex gap-2">
                            <TextInput value={photo} placeholder="https://..." onChange={e => {
                              const newPhotos = [...(editForm.photos || [])];
                              newPhotos[i] = e.target.value;
                              setEditForm({...editForm, photos: newPhotos});
                            }} />
                            <Btn variant="danger" icon="delete" onClick={() => {
                              const newPhotos = (editForm.photos || []).filter((_, idx) => idx !== i);
                              setEditForm({...editForm, photos: newPhotos});
                            }} />
                          </div>
                        ))}
                      </div>
                      <Btn size="sm" icon="add" onClick={() => setEditForm({...editForm, photos: [...(editForm.photos || []), "https://example.com/image.jpg"]})}>画像を追加</Btn>
                    </Field>
                  </div>
                </FormSection>

                <FormSection title="メンテナンス履歴">
                  <div className="space-y-2 mb-2">
                    {(editForm.maintenanceHistory || []).map((m, i) => (
                      <div key={i} className="flex gap-2 items-center">
                        <TextInput type="date" className="w-36" value={(m.date || "").replace(/\//g, "-")} onChange={e => {
                          const arr = [...(editForm.maintenanceHistory || [])];
                          arr[i] = {...arr[i], date: e.target.value.replace(/-/g, "/")};
                          setEditForm({...editForm, maintenanceHistory: arr});
                        }} />
                        <TextInput placeholder="メンテナンス項目" className="flex-1" value={m.item} onChange={e => {
                          const arr = [...(editForm.maintenanceHistory || [])];
                          arr[i] = {...arr[i], item: e.target.value};
                          setEditForm({...editForm, maintenanceHistory: arr});
                        }} />
                        <TextInput placeholder="走行距離" className="w-28" value={m.mileage} onChange={e => {
                          const arr = [...(editForm.maintenanceHistory || [])];
                          arr[i] = {...arr[i], mileage: e.target.value};
                          setEditForm({...editForm, maintenanceHistory: arr});
                        }} />
                        <Btn variant="danger" icon="delete" onClick={() => {
                          const arr = (editForm.maintenanceHistory || []).filter((_, idx) => idx !== i);
                          setEditForm({...editForm, maintenanceHistory: arr});
                        }} />
                      </div>
                    ))}
                  </div>
                  <Btn size="sm" icon="add" onClick={() => setEditForm({...editForm, maintenanceHistory: [...(editForm.maintenanceHistory || []), {date: "2026/01/01", item: "定期点検", mileage: "0 km"}]})}>履歴を追加</Btn>
                </FormSection>

              </div>
            )}
          </div>
        )}
      </Drawer>

      <Modal
        open={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="新規車両の登録"
        width={460}
        footer={
          <>
            <Btn variant="secondary" onClick={() => setIsAddModalOpen(false)}>キャンセル</Btn>
            <Btn variant="primary" icon="check" onClick={handleSaveItem}>登録</Btn>
          </>
        }
      >
        <form onSubmit={handleSaveItem} className="space-y-3">
          <Field label="車両名" required>
            <TextInput value={newName} onChange={e => setNewName(e.target.value)} placeholder="例：軽トラック" />
          </Field>
          <Row>
            <Field label="ナンバープレート" required>
              <TextInput value={newPlate} onChange={e => setNewPlate(e.target.value)} placeholder="例：品川 580 あ 1234" />
            </Field>
            <Field label="カテゴリー" required>
              <SelectInput value={newCat} onChange={e => setNewCat(e.target.value)} options={["軽トラック", "軽バン", "2tトラック", "3tダンプ", "高所作業車"]} />
            </Field>
          </Row>
          <Row>
            <Field label="初期走行距離" required>
              <TextInput value={newMileage} onChange={e => setNewMileage(e.target.value)} />
            </Field>
            <Field label="ステータス" required>
              <SelectInput value={newStatus} onChange={e => setNewStatus(e.target.value as any)} options={["空車", "使用中", "整備中"]} />
            </Field>
          </Row>
        </form>
      </Modal>
    </div>
  );
}
