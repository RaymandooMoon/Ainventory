import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Cloud,
  CloudRain,
  CloudSun,
  Layers,
  Plus,
  Shirt,
  Snowflake,
  Sun,
  Trash2,
  X,
} from 'lucide-react';
import { normalizeWardrobeCategoryKey } from '../../contracts/carbonDesignContract.ts';
import {
  localizeBrandName,
  localizeCalendarNote,
  localizeGarmentName,
  localizeOutfitTitle,
  tx,
} from '../../utils/i18n.ts';
import { pushBackHandler, triggerHaptic } from '../../utils/nativeBridge.ts';
import GarmentObject25D from '../GarmentObject25D.jsx';
import { StackedGarmentPreview } from './CalendarLookbookGrid.jsx';
import {
  parseIsoDateLocal,
  resolveEntryItems,
  shiftIsoDate,
} from './calendarHelpers.js';

const WEATHER_PRESETS = [
  { key: 'clear', ko: '맑음', en: 'Clear', Icon: Sun },
  { key: 'partly', ko: '구름조금', en: 'Partly Cloudy', Icon: CloudSun },
  { key: 'cloudy', ko: '흐림', en: 'Cloudy', Icon: Cloud },
  { key: 'rain', ko: '비', en: 'Rain', Icon: CloudRain },
  { key: 'snow', ko: '눈', en: 'Snow', Icon: Snowflake },
];

const DOW_FULL_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DOW_FULL_KO = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];

function inferWeatherKey(rawSummary) {
  const s = String(rawSummary || '').trim().toLowerCase();
  if (!s) return '';
  if (/비|소나기|rain|shower|drizzle/.test(s)) return 'rain';
  if (/눈|snow|sleet/.test(s)) return 'snow';
  if (/구름\s*조금|구름조금|partly/.test(s)) return 'partly';
  if (/흐림|구름|안개|cloud|overcast|fog/.test(s)) return 'cloudy';
  if (/맑음|쾌청|clear|sun/.test(s)) return 'clear';
  return '';
}

function getCategoryDisplayLabel(rawCategory, lang = 'ko') {
  const key = normalizeWardrobeCategoryKey(rawCategory);
  if (lang === 'en') {
    if (key === 'top') return 'Tops';
    if (key === 'bottom') return 'Bottoms';
    if (key === 'outer') return 'Outerwear';
    if (key === 'shoes') return 'Shoes';
    return 'Accessories';
  }
  if (key === 'top') return '상의';
  if (key === 'bottom') return '하의';
  if (key === 'outer') return '아우터';
  if (key === 'shoes') return '슈즈';
  return '액세서리';
}

function buildInitialDrawerState({
  selectedDate,
  initialEntryId,
  dateEntries,
  outfits,
  garments,
  garmentMap,
  lang,
  todayStr,
}) {
  let targetEntry = null;
  if (initialEntryId !== null && initialEntryId !== undefined) {
    targetEntry = dateEntries.find((e) => Number(e.id) === Number(initialEntryId)) || null;
  }
  if (!targetEntry && dateEntries.length > 0) {
    targetEntry = dateEntries[0];
  }

  if (targetEntry) {
    const outId = targetEntry.outfit_id ? String(targetEntry.outfit_id) : '';
    const resolvedItems = resolveEntryItems(targetEntry, outfits, garmentMap);
    return {
      activeEntryKey: String(targetEntry.id),
      status: targetEntry.status === 'planned' ? 'planned' : 'worn',
      weatherKey: inferWeatherKey(targetEntry.weather_summary),
      tempInput:
        targetEntry.temp_c !== null &&
        targetEntry.temp_c !== undefined &&
        targetEntry.temp_c !== ''
          ? String(Math.round(Number(targetEntry.temp_c)))
          : '',
      noteInput: localizeCalendarNote(targetEntry.note || '', lang),
      selectedOutfitId: outId,
      selectedItemIds: resolvedItems.map((g) => Number(g.id)),
      pickerTab: outId || outfits.length > 0 ? 'outfits' : 'pieces',
    };
  }

  const defaultOutfit = outfits[0] || null;
  if (defaultOutfit) {
    return {
      activeEntryKey: 'new',
      status: selectedDate > todayStr ? 'planned' : 'worn',
      weatherKey: 'clear',
      tempInput: '',
      noteInput: '',
      selectedOutfitId: String(defaultOutfit.id),
      selectedItemIds: Array.isArray(defaultOutfit.item_ids)
        ? defaultOutfit.item_ids.map(Number)
        : [],
      pickerTab: 'outfits',
    };
  }

  return {
    activeEntryKey: 'new',
    status: selectedDate > todayStr ? 'planned' : 'worn',
    weatherKey: 'clear',
    tempInput: '',
    noteInput: '',
    selectedOutfitId: '',
    selectedItemIds: garments.slice(0, 2).map((g) => Number(g.id)),
    pickerTab: 'pieces',
  };
}

function SlideOverDrawerSession({
  headingId,
  onClose,
  selectedDate,
  initialEntryId,
  onChangeDate,
  todayStr,
  dateEntries,
  outfits,
  garments,
  garmentMap,
  lang,
  saving,
  onSaveEntry,
  onDeleteEntry,
}) {
  const initialState = useMemo(
    () =>
      buildInitialDrawerState({
        selectedDate,
        initialEntryId,
        dateEntries,
        outfits,
        garments,
        garmentMap,
        lang,
        todayStr,
      }),
    [selectedDate, initialEntryId, dateEntries, outfits, garments, garmentMap, lang, todayStr]
  );

  const [activeEntryKey, setActiveEntryKey] = useState(initialState.activeEntryKey);
  const [status, setStatus] = useState(initialState.status);
  const [weatherKey, setWeatherKey] = useState(initialState.weatherKey);
  const [tempInput, setTempInput] = useState(initialState.tempInput);
  const [noteInput, setNoteInput] = useState(initialState.noteInput);
  const [selectedOutfitId, setSelectedOutfitId] = useState(initialState.selectedOutfitId);
  const [selectedItemIds, setSelectedItemIds] = useState(initialState.selectedItemIds);
  const [pickerTab, setPickerTab] = useState(initialState.pickerTab);

  const activeEntry = useMemo(() => {
    if (activeEntryKey === 'new') return null;
    return dateEntries.find((e) => String(e.id) === String(activeEntryKey)) || null;
  }, [activeEntryKey, dateEntries]);

  const selectExistingTab = (entry) => {
    triggerHaptic('selection');
    setActiveEntryKey(String(entry.id));
    setStatus(entry.status === 'planned' ? 'planned' : 'worn');
    setWeatherKey(inferWeatherKey(entry.weather_summary));
    setTempInput(
      entry.temp_c !== null && entry.temp_c !== undefined && entry.temp_c !== ''
        ? String(Math.round(Number(entry.temp_c)))
        : ''
    );
    setNoteInput(localizeCalendarNote(entry.note || '', lang));
    const outId = entry.outfit_id ? String(entry.outfit_id) : '';
    setSelectedOutfitId(outId);
    const resolvedItems = resolveEntryItems(entry, outfits, garmentMap);
    setSelectedItemIds(resolvedItems.map((g) => Number(g.id)));
  };

  const selectNewTab = () => {
    triggerHaptic('selection');
    setActiveEntryKey('new');
    setStatus(selectedDate > todayStr ? 'planned' : 'worn');
    setWeatherKey('clear');
    setTempInput('');
    setNoteInput('');
    const defaultOutfit = outfits[0] || null;
    if (defaultOutfit) {
      setSelectedOutfitId(String(defaultOutfit.id));
      setSelectedItemIds(
        Array.isArray(defaultOutfit.item_ids) ? defaultOutfit.item_ids.map(Number) : []
      );
      setPickerTab('outfits');
    } else {
      setSelectedOutfitId('');
      setSelectedItemIds(garments.slice(0, 2).map((g) => Number(g.id)));
      setPickerTab('pieces');
    }
  };

  const handleChooseOutfit = (outfit) => {
    triggerHaptic('selection');
    setSelectedOutfitId(String(outfit.id));
    const ids = Array.isArray(outfit.item_ids) ? outfit.item_ids.map(Number) : [];
    setSelectedItemIds(ids);
  };

  const handleToggleGarmentPiece = (garmentId) => {
    triggerHaptic('selection');
    const numId = Number(garmentId);
    setSelectedOutfitId('');
    setSelectedItemIds((prev) =>
      prev.includes(numId) ? prev.filter((id) => id !== numId) : [...prev, numId]
    );
  };

  const curatedGarments = useMemo(
    () => selectedItemIds.map((id) => garmentMap.get(Number(id))).filter(Boolean),
    [garmentMap, selectedItemIds]
  );

  const dateLabelFull = useMemo(() => {
    const dt = parseIsoDateLocal(selectedDate);
    const dow = lang === 'en' ? DOW_FULL_EN[dt.getDay()] : DOW_FULL_KO[dt.getDay()];
    return `${selectedDate.replace(/-/g, '. ')} · ${dow}`;
  }, [lang, selectedDate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const chosenPreset = WEATHER_PRESETS.find((w) => w.key === weatherKey);
    const weatherSummary = chosenPreset ? (lang === 'en' ? chosenPreset.en : chosenPreset.ko) : '';
    const parsedTemp =
      tempInput.trim() !== '' && Number.isFinite(Number(tempInput))
        ? Math.round(Number(tempInput))
        : null;

    await onSaveEntry?.({
      existingEntry: activeEntry,
      worn_date: selectedDate,
      outfit_id: selectedOutfitId ? Number(selectedOutfitId) : null,
      item_ids: selectedItemIds,
      status,
      weather_summary: weatherSummary,
      temp_c: parsedTemp,
      note: noteInput.trim(),
    });
  };

  return (
    <aside
      role="dialog"
      aria-modal="true"
      aria-labelledby={headingId}
      className="cal-ed-drawer-panel"
      onClick={(e) => e.stopPropagation()}
    >
      <header className="cal-ed-drawer-header">
        <div className="cal-ed-drawer-title-group">
          <span className="cal-ed-eyebrow">
            {tx(lang, '데일리 룩북 드로어', 'LOOKBOOK DETAIL DRAWER')}
          </span>
          <h2 id={headingId} className="cal-ed-drawer-date-heading">
            {dateLabelFull}
          </h2>
        </div>

        <div className="cal-ed-nav-controls">
          <button
            type="button"
            className="cal-ed-icon-pill"
            onClick={() => {
              triggerHaptic('selection');
              onChangeDate?.(shiftIsoDate(selectedDate, -1));
            }}
            aria-label={tx(lang, '이전 날짜', 'Previous Day')}
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            className="cal-ed-icon-pill"
            onClick={() => {
              triggerHaptic('selection');
              onChangeDate?.(shiftIsoDate(selectedDate, 1));
            }}
            aria-label={tx(lang, '다음 날짜', 'Next Day')}
          >
            <ChevronRight size={16} />
          </button>
          <button
            type="button"
            className="cal-ed-icon-pill"
            onClick={() => onClose?.()}
            aria-label={tx(lang, '드로어 닫기', 'Close Drawer')}
          >
            <X size={17} />
          </button>
        </div>
      </header>

      <form id="calendar-drawer-form" onSubmit={handleSubmit} className="cal-ed-drawer-body">
        {dateEntries.length > 0 && (
          <div className="cal-ed-entry-tabs">
            {dateEntries.map((entry, idx) => {
              const isSelected = String(activeEntryKey) === String(entry.id);
              return (
                <button
                  key={entry.id}
                  type="button"
                  className={`cal-ed-entry-tab ${isSelected ? 'is-active' : ''}`}
                  onClick={() => selectExistingTab(entry)}
                >
                  <span>{tx(lang, `룩 #${idx + 1}`, `Look 0${idx + 1}`)}</span>
                </button>
              );
            })}
            <button
              type="button"
              className={`cal-ed-entry-tab ${activeEntryKey === 'new' ? 'is-active' : ''}`}
              onClick={selectNewTab}
            >
              <Plus size={13} />
              <span>{tx(lang, '새 착장 추가', 'Add New')}</span>
            </button>
          </div>
        )}

        {/* 1. Curated Garment Breakdown */}
        <div className="cal-ed-drawer-section">
          <div className="cal-ed-section-head">
            <span className="cal-ed-section-label">
              {tx(lang, '당일 착장 상세 구성', 'CURATED GARMENT LINEUP')}
            </span>
            <span className="cal-ed-eyebrow tabular-nums">
              {tx(lang, `${curatedGarments.length}개 아이템`, `${curatedGarments.length} PIECES`)}
            </span>
          </div>

          <div className="cal-ed-lineup-card">
            {curatedGarments.length > 0 ? (
              <>
                <StackedGarmentPreview items={curatedGarments} lang={lang} large />
                <div className="cal-ed-lineup-list">
                  {curatedGarments.map((item) => (
                    <div key={item.id} className="cal-ed-lineup-item">
                      <div className="cal-ed-lineup-thumb">
                        <GarmentObject25D
                          item={item}
                          alt={localizeGarmentName(item.name, lang)}
                          padding="10%"
                        />
                      </div>
                      <div className="cal-ed-lineup-text">
                        <span className="cal-ed-lineup-name">
                          {localizeGarmentName(item.name, lang)}
                        </span>
                        <span className="cal-ed-lineup-cat">
                          {localizeBrandName(item.brand, lang) ||
                            getCategoryDisplayLabel(item.category, lang)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="cal-ed-week-empty-frame" style={{ height: 96 }}>
                <Shirt size={18} />
                <span>
                  {tx(
                    lang,
                    '아래에서 저장된 코디나 개별 의류를 선택하세요',
                    'Select a saved outfit or closet pieces below'
                  )}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* 2. Date & Status Segmented Switch */}
        <div className="cal-ed-drawer-section">
          <span className="cal-ed-section-label">
            {tx(lang, '일정 날짜 · 착용 상태', 'SCHEDULE & STATUS')}
          </span>
          <div className="cal-ed-inline-inputs">
            <input
              id="calendar-date-input"
              type="date"
              className="hig-native-input tabular-nums"
              value={selectedDate}
              onChange={(e) => {
                if (e.target.value) onChangeDate?.(e.target.value);
              }}
              aria-label={tx(lang, '날짜', 'Date')}
              required
            />
            <div
              className="cal-ed-seg-track"
              style={{ '--seg-idx': status === 'worn' ? 0 : 1, minWidth: 0 }}
            >
              <span className="cal-ed-seg-thumb" aria-hidden="true" />
              <button
                type="button"
                className={`cal-ed-seg-btn ${status === 'worn' ? 'is-active' : ''}`}
                onClick={() => {
                  triggerHaptic('selection');
                  setStatus('worn');
                }}
              >
                {tx(lang, '착용', 'Worn')}
              </button>
              <button
                type="button"
                className={`cal-ed-seg-btn ${status === 'planned' ? 'is-active' : ''}`}
                onClick={() => {
                  triggerHaptic('selection');
                  setStatus('planned');
                }}
              >
                {tx(lang, '예정', 'Planned')}
              </button>
            </div>
          </div>
        </div>

        {/* 3. Weather Badge & Temperature */}
        <div className="cal-ed-drawer-section">
          <span className="cal-ed-section-label">
            {tx(lang, '날씨 · 기온 기록', 'WEATHER & TEMPERATURE')}
          </span>
          <div className="cal-ed-weather-row">
            {WEATHER_PRESETS.map((preset) => {
              const Icon = preset.Icon;
              const active = weatherKey === preset.key;
              return (
                <button
                  key={preset.key}
                  type="button"
                  className={`cal-ed-weather-chip ${active ? 'is-active' : ''}`}
                  onClick={() => {
                    triggerHaptic('selection');
                    setWeatherKey((prev) => (prev === preset.key ? '' : preset.key));
                  }}
                >
                  <Icon size={13} />
                  <span>{lang === 'en' ? preset.en : preset.ko}</span>
                </button>
              );
            })}
          </div>

          <div className="cal-ed-inline-inputs" style={{ marginTop: 4 }}>
            <input
              id="calendar-note-input"
              type="text"
              className="hig-native-input"
              placeholder={tx(
                lang,
                '착용 메모 (예: 출근룩 / 전시 관람)',
                'Wear memo (e.g. Office / Gallery)'
              )}
              aria-label={tx(lang, '착용 메모', 'Wear Memo')}
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
              maxLength={140}
            />
            <input
              id="calendar-temp-input"
              type="number"
              className="hig-native-input tabular-nums"
              placeholder={tx(lang, '기온 (°C)', 'Temp (°C)')}
              aria-label={tx(lang, '기온 섭씨', 'Temperature Celsius')}
              value={tempInput}
              onChange={(e) => setTempInput(e.target.value)}
              min={-30}
              max={48}
            />
          </div>
        </div>

        {/* 4. Seamless Outfit Changer */}
        <div className="cal-ed-drawer-section">
          <div className="cal-ed-section-head">
            <span className="cal-ed-section-label">
              {tx(lang, '코디 변경 · 아이템 조합', 'CHANGE OUTFIT OR PIECES')}
            </span>
          </div>

          <div
            className="cal-ed-seg-track"
            style={{ '--seg-idx': pickerTab === 'outfits' ? 0 : 1, width: '100%' }}
          >
            <span className="cal-ed-seg-thumb" aria-hidden="true" />
            <button
              type="button"
              className={`cal-ed-seg-btn ${pickerTab === 'outfits' ? 'is-active' : ''}`}
              onClick={() => {
                triggerHaptic('selection');
                setPickerTab('outfits');
              }}
            >
              <Layers size={13} />
              <span>
                {tx(lang, '저장된 코디', 'Saved Outfits')} ({outfits.length})
              </span>
            </button>
            <button
              type="button"
              className={`cal-ed-seg-btn ${pickerTab === 'pieces' ? 'is-active' : ''}`}
              onClick={() => {
                triggerHaptic('selection');
                setPickerTab('pieces');
              }}
            >
              <Shirt size={13} />
              <span>
                {tx(lang, '옷장 직접 선택', 'Closet Pieces')} ({garments.length})
              </span>
            </button>
          </div>

          {pickerTab === 'outfits' ? (
            outfits.length > 0 ? (
              <div className="cal-ed-outfit-grid">
                {outfits.map((outfit) => {
                  const isSelected = String(selectedOutfitId) === String(outfit.id);
                  const outfitItems = (Array.isArray(outfit.item_ids) ? outfit.item_ids : [])
                    .map((id) => garmentMap.get(Number(id)))
                    .filter(Boolean)
                    .slice(0, 4);
                  return (
                    <button
                      key={outfit.id}
                      type="button"
                      className={`cal-ed-outfit-option ${isSelected ? 'is-selected' : ''}`}
                      onClick={() => handleChooseOutfit(outfit)}
                    >
                      <div className="cal-ed-archive-meta">
                        <strong className="cal-ed-archive-name">
                          {localizeOutfitTitle(outfit.title, lang)}
                        </strong>
                        <span className="cal-ed-archive-date">
                          {tx(
                            lang,
                            `${outfitItems.length}개 아이템 구성`,
                            `${outfitItems.length} pieces`
                          )}
                        </span>
                      </div>
                      <div className="cal-ed-outfit-option-thumbs">
                        {outfitItems.map((g) => (
                          <div key={g.id} className="cal-ed-outfit-mini-thumb">
                            <GarmentObject25D
                              item={g}
                              alt={localizeGarmentName(g.name, lang)}
                              padding="10%"
                            />
                          </div>
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="cal-ed-week-empty-frame" style={{ height: 84 }}>
                <span>
                  {tx(
                    lang,
                    '저장된 코디가 없습니다. 우측 [옷장 직접 선택] 탭에서 의류를 조합하세요.',
                    'No saved outfits yet. Switch to Closet Pieces to curate items directly.'
                  )}
                </span>
              </div>
            )
          ) : garments.length > 0 ? (
            <div className="cal-ed-garment-picker-grid">
              {garments.map((item) => {
                const picked = selectedItemIds.includes(Number(item.id));
                const name = localizeGarmentName(item.name, lang);
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`cal-ed-garment-pick-tile ${picked ? 'is-selected' : ''}`}
                    onClick={() => handleToggleGarmentPiece(item.id)}
                  >
                    {picked && (
                      <span className="cal-ed-pick-check" aria-hidden="true">
                        <Check size={11} strokeWidth={2.8} />
                      </span>
                    )}
                    <div className="cal-ed-garment-pick-thumb">
                      <GarmentObject25D item={item} alt={name} padding="11%" />
                    </div>
                    <span className="cal-ed-garment-pick-name">{name}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="cal-ed-week-empty-frame" style={{ height: 84 }}>
              <span>
                {tx(lang, '옷장에 등록된 아이템이 없습니다.', 'No garments in your closet yet.')}
              </span>
            </div>
          )}
        </div>
      </form>

      <footer className="cal-ed-drawer-footer">
        {activeEntry && (
          <button
            type="button"
            className="cal-ed-delete-btn"
            disabled={saving}
            onClick={() => onDeleteEntry?.(activeEntry.id)}
            aria-label={tx(lang, '일정 삭제', 'Delete Entry')}
          >
            <Trash2 size={16} />
            <span>{tx(lang, '삭제', 'Delete')}</span>
          </button>
        )}
        <button
          type="submit"
          form="calendar-drawer-form"
          className="cal-ed-save-btn"
          disabled={saving}
        >
          <Check size={17} />
          <span>
            {activeEntry
              ? tx(lang, '착장 업데이트', 'Update Look')
              : tx(lang, '룩북 일정 저장', 'Save Lookbook Entry')}
          </span>
        </button>
      </footer>
    </aside>
  );
}

export default function CalendarSlideOverDrawer({
  open,
  onClose,
  selectedDate,
  initialEntryId = null,
  onChangeDate,
  todayStr,
  logs = [],
  outfits = [],
  garments = [],
  garmentMap,
  lang = 'ko',
  saving = false,
  onSaveEntry,
  onDeleteEntry,
}) {
  const headingId = useId();
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return undefined;
    const popBack = pushBackHandler(() => {
      onCloseRef.current?.();
      return true;
    });
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current?.();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      popBack();
    };
  }, [open]);

  const dateEntries = useMemo(
    () => logs.filter((l) => String(l.worn_date || '').slice(0, 10) === selectedDate),
    [logs, selectedDate]
  );

  if (!open) return null;

  const sessionKey = `${selectedDate}::${initialEntryId ?? 'auto'}::${dateEntries.map((e) => e.id).join(',')}`;

  const drawerNode = (
    <div
      className="cal-ed-drawer-backdrop"
      onClick={() => onClose?.()}
      data-testid="calendar-slideover-backdrop"
    >
      <SlideOverDrawerSession
        key={sessionKey}
        headingId={headingId}
        onClose={onClose}
        selectedDate={selectedDate}
        initialEntryId={initialEntryId}
        onChangeDate={onChangeDate}
        todayStr={todayStr}
        dateEntries={dateEntries}
        outfits={outfits}
        garments={garments}
        garmentMap={garmentMap}
        lang={lang}
        saving={saving}
        onSaveEntry={onSaveEntry}
        onDeleteEntry={onDeleteEntry}
      />
    </div>
  );

  if (typeof document !== 'undefined') {
    return createPortal(drawerNode, document.body);
  }
  return drawerNode;
}
