import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { CARBON_DOM_CONTRACT } from '../contracts/carbonDesignContract.ts';
import {
  FITTING_SLOTS,
  mapGarmentToFittingSlot,
  renderOutfitFitting,
} from '../services/fittingRenderer.ts';
import { apiFetch } from '../utils/api.ts';
import { triggerHaptic } from '../utils/nativeBridge.ts';
import GarmentObject25D from './GarmentObject25D.jsx';
import Studio25DCanvas from './Studio25DCanvas.jsx';
import { ResponsiveSheetModal } from './common/AppUI.jsx';

export default function OutfitStudioView({
  activeCloset,
  garments = [],
  theme = 'light',
  preEquippedGarment,
  onConsumePreEquipped,
  onClosetUpdated,
  showToast,
}) {
  const [slots, setSlots] = useState({
    outer: null,
    top: null,
    bottom: null,
    shoes: null,
    accessory: null,
  });
  const [seededInitial, setSeededInitial] = useState(false);
  const [activeSlotKey, setActiveSlotKey] = useState('top');
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
  const [renderResult, setRenderResult] = useState(null);

  const [savedOutfits, setSavedOutfits] = useState([]);
  const [outfitTitle, setOutfitTitle] = useState('');
  const [savingOutfit, setSavingOutfit] = useState(false);

  const loadOutfits = useCallback(async () => {
    try {
      const q = encodeURIComponent(activeCloset || 'sample');
      const res = await apiFetch(`/outfits?closet=${q}`);
      setSavedOutfits(res.outfits || []);
    } catch {
      // keep local state
    }
  }, [activeCloset]);

  useEffect(() => {
    loadOutfits();
  }, [loadOutfits]);

  // Seed a balanced initial 2.5D studio outfit once garments load (unless preEquippedGarment arrives first)
  useEffect(() => {
    if (seededInitial || garments.length === 0) return;
    const findFirst = (slotKey) =>
      garments.find((g) => mapGarmentToFittingSlot(g) === slotKey) || null;
    setSlots((prev) => {
      const hasAny = Object.values(prev).some(Boolean);
      if (hasAny) return prev;
      return {
        outer: null,
        top: findFirst('top'),
        bottom: findFirst('bottom'),
        shoes: findFirst('shoes'),
        accessory: null,
      };
    });
    setSeededInitial(true);
  }, [garments, seededInitial]);

  // Handle `[Outfits에서 코디해보기]` handoff from ItemDetailSheet
  useEffect(() => {
    if (!preEquippedGarment) return;
    const targetSlot = mapGarmentToFittingSlot(preEquippedGarment);
    setSlots((prev) => ({
      ...prev,
      [targetSlot]: preEquippedGarment,
    }));
    setActiveSlotKey(targetSlot);
    setSeededInitial(true);
    onConsumePreEquipped?.();
  }, [preEquippedGarment, onConsumePreEquipped]);

  // Keep equipped garment references fresh if edited or deleted in Closet
  useEffect(() => {
    if (garments.length === 0) return;
    const byId = new Map(garments.map((g) => [Number(g.id), g]));
    setSlots((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const key of Object.keys(next)) {
        const cur = next[key];
        if (!cur) continue;
        const fresh = byId.get(Number(cur.id));
        if (!fresh) {
          next[key] = null;
          changed = true;
        } else if (fresh !== cur) {
          next[key] = fresh;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [garments]);

  // Run modular FittingRenderer (`Studio25DFittingRenderer` or `VtonApiFittingRenderer`)
  useEffect(() => {
    let cancelled = false;
    renderOutfitFitting({ slots, theme }).then((res) => {
      if (!cancelled) {
        setRenderResult(res);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [slots, theme]);

  const slotGarments = useMemo(() => {
    return garments.filter((g) => mapGarmentToFittingSlot(g) === activeSlotKey);
  }, [garments, activeSlotKey]);

  const equippedItems = useMemo(() => {
    return FITTING_SLOTS.map((s) => slots[s.key]).filter(Boolean);
  }, [slots]);

  const handleToggleEquip = (item) => {
    const slotKey = mapGarmentToFittingSlot(item);
    triggerHaptic('selection');
    setSlots((prev) => ({
      ...prev,
      [slotKey]: prev[slotKey]?.id === item.id ? null : item,
    }));
  };

  const handleUnequipSlot = (slotKey) => {
    triggerHaptic('selection');
    setSlots((prev) => ({ ...prev, [slotKey]: null }));
  };

  const handleClearAll = () => {
    triggerHaptic('selection');
    setSlots({
      outer: null,
      top: null,
      bottom: null,
      shoes: null,
      accessory: null,
    });
  };

  const handleSaveOutfit = async (e) => {
    e?.preventDefault?.();
    if (equippedItems.length === 0) {
      showToast?.('최소 1개 이상의 의류를 선택해주세요.');
      return;
    }
    setSavingOutfit(true);
    try {
      const title =
        outfitTitle.trim() ||
        equippedItems
          .slice(0, 2)
          .map((g) => g.name)
          .join(' + ');
      await apiFetch('/outfits', {
        method: 'POST',
        body: JSON.stringify({
          closet_owner: activeCloset || 'sample',
          title,
          occasion: 'Daily',
          season: '봄/가을',
          item_ids: equippedItems.map((g) => g.id),
        }),
      });
      setOutfitTitle('');
      triggerHaptic('medium');
      await loadOutfits();
      onClosetUpdated?.();
      showToast?.('코디가 저장되었습니다.');
    } catch (err) {
      showToast?.(err?.message || '코디 저장에 실패했습니다.');
    } finally {
      setSavingOutfit(false);
    }
  };

  const handleApplySavedOutfit = (outfit) => {
    const idSet = new Set((outfit.item_ids || []).map(Number));
    const next = {
      outer: null,
      top: null,
      bottom: null,
      shoes: null,
      accessory: null,
    };
    for (const g of garments) {
      if (idSet.has(Number(g.id))) {
        const sKey = mapGarmentToFittingSlot(g);
        if (!next[sKey]) next[sKey] = g;
      }
    }
    triggerHaptic('selection');
    setSlots(next);
  };

  const handleDeleteSavedOutfit = async (outfitId) => {
    try {
      await apiFetch(`/outfits/${outfitId}`, { method: 'DELETE' });
      await loadOutfits();
    } catch {
      // ignore
    }
  };

  const renderSlotInventoryGrid = (closeOnPick = false) => (
    <div className="studio-mini-inventory-grid">
      {slotGarments.map((item) => {
        const isEquipped = slots[activeSlotKey]?.id === item.id;
        return (
          <button
            key={item.id}
            type="button"
            data-slot-garment-id={item.id}
            aria-pressed={isEquipped}
            className={`studio-mini-garment-card ${isEquipped ? 'is-equipped' : ''}`}
            onClick={() => {
              handleToggleEquip(item);
              if (closeOnPick) setMobileSheetOpen(false);
            }}
          >
            <div className="studio-mini-squircle">
              <GarmentObject25D item={item} padding="11%" />
              {isEquipped && (
                <span className="studio-equipped-badge" aria-hidden="true">
                  <Check size={12} strokeWidth={2.6} />
                </span>
              )}
            </div>
            <span className="hig-garment-name">{item.name}</span>
          </button>
        );
      })}
    </div>
  );

  return (
    <section className="hig-screen-container hig-outfits-screen" aria-label="Outfits">
      <header className="hig-top-bar">
        <div className="hig-top-bar-titles">
          <h1 className="hig-screen-title">OUTFITS</h1>
          <span className="hig-item-count tabular-nums">{equippedItems.length} ACTIVE</span>
        </div>

        <div className="hig-top-bar-actions">
          {equippedItems.length > 0 && (
            <button
              type="button"
              className="hig-circle-icon-btn is-subtle"
              onClick={handleClearAll}
              aria-label="착장 초기화"
            >
              <RotateCcw size={17} />
            </button>
          )}
        </div>
      </header>

      <div className="studio-25d-layout">
        {/* Center: 2.5D Studio Canvas */}
        <div className="studio-25d-stage-col">
          <Studio25DCanvas
            renderResult={renderResult}
            activeSlotKey={activeSlotKey}
            onSelectSlot={(slotKey) => {
              setActiveSlotKey(slotKey);
              if (window.innerWidth < 900) {
                setMobileSheetOpen(true);
              }
            }}
            onUnequipSlot={handleUnequipSlot}
          />

          {/* Mobile Slot Dock Trigger (opens Bottom Sheet Picker on < 900px) */}
          <div className="studio-mobile-slot-bar">
            {FITTING_SLOTS.map((slot) => {
              const assigned = slots[slot.key];
              const isSelected = activeSlotKey === slot.key;
              return (
                <button
                  key={slot.key}
                  type="button"
                  data-mobile-slot-btn={slot.key}
                  className={`studio-mobile-slot-pill ${isSelected ? 'active' : ''} ${assigned ? 'filled' : ''}`}
                  onClick={() => {
                    setActiveSlotKey(slot.key);
                    setMobileSheetOpen(true);
                  }}
                >
                  <span>{slot.label}</span>
                  {assigned ? <span className="studio-slot-dot" /> : <Plus size={12} />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Side (Desktop >= 900px): Mini Inventory Slot Combiner */}
        <aside id={CARBON_DOM_CONTRACT.studioSlotPickerId} className="studio-desktop-picker-col">
          <div className="hig-pill-rail studio-slot-tabs" role="tablist" aria-label="Outfit Slots">
            {FITTING_SLOTS.map((slot) => {
              const active = activeSlotKey === slot.key;
              const hasItem = Boolean(slots[slot.key]);
              return (
                <button
                  key={slot.key}
                  type="button"
                  role="tab"
                  data-outfit-slot-tab={slot.key}
                  aria-selected={active}
                  className={`hig-filter-pill ${active ? 'active' : ''}`}
                  onClick={() => setActiveSlotKey(slot.key)}
                >
                  <span>{slot.label}</span>
                  {hasItem && <span className="studio-slot-dot" />}
                </button>
              );
            })}
          </div>

          <div className="studio-desktop-inventory-scroll">{renderSlotInventoryGrid(false)}</div>

          <form onSubmit={handleSaveOutfit} className="studio-save-bar">
            <input
              type="text"
              className="hig-native-input"
              placeholder="Outfit Name"
              value={outfitTitle}
              onChange={(e) => setOutfitTitle(e.target.value)}
              maxLength={80}
            />
            <button
              id={CARBON_DOM_CONTRACT.studioSaveOutfitBtnId}
              type="submit"
              className="hig-primary-cta-btn studio-save-submit"
              disabled={savingOutfit || equippedItems.length === 0}
            >
              <Check size={16} />
              <span>Save</span>
            </button>
          </form>

          {savedOutfits.length > 0 && (
            <div className="studio-saved-looks-rail" aria-label="Saved Outfits">
              {savedOutfits.map((outfit) => (
                <div key={outfit.id} className="studio-saved-look-chip">
                  <button
                    type="button"
                    className="studio-saved-look-select"
                    onClick={() => handleApplySavedOutfit(outfit)}
                  >
                    {outfit.title}
                  </button>
                  <button
                    type="button"
                    className="studio-saved-look-del"
                    aria-label={`${outfit.title} 삭제`}
                    onClick={() => handleDeleteSavedOutfit(outfit.id)}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>

      {/* Mobile Save Bar */}
      <form onSubmit={handleSaveOutfit} className="studio-mobile-save-row">
        <input
          type="text"
          className="hig-native-input"
          placeholder="Outfit Name"
          value={outfitTitle}
          onChange={(e) => setOutfitTitle(e.target.value)}
          maxLength={80}
        />
        <button
          type="submit"
          data-testid="mobile-save-outfit-btn"
          className="hig-primary-cta-btn studio-save-submit"
          disabled={savingOutfit || equippedItems.length === 0}
        >
          <Check size={16} />
          <span>Save</span>
        </button>
      </form>

      {/* Mobile Bottom Sheet Mini Inventory Picker */}
      <ResponsiveSheetModal
        open={mobileSheetOpen}
        onClose={() => setMobileSheetOpen(false)}
        title={FITTING_SLOTS.find((s) => s.key === activeSlotKey)?.label || 'Select Item'}
        maxWidth={520}
      >
        <div className="hig-pill-rail" style={{ marginBottom: 14 }}>
          {FITTING_SLOTS.map((slot) => (
            <button
              key={slot.key}
              type="button"
              className={`hig-filter-pill ${activeSlotKey === slot.key ? 'active' : ''}`}
              onClick={() => setActiveSlotKey(slot.key)}
            >
              {slot.label}
            </button>
          ))}
        </div>
        {renderSlotInventoryGrid(true)}
      </ResponsiveSheetModal>
    </section>
  );
}
