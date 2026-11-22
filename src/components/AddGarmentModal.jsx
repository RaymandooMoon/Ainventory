import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  Globe,
  ImagePlus,
  Loader2,
  Lock,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Tag,
  X,
} from 'lucide-react';
import {
  CARBON_DOM_CONTRACT,
  WARDROBE_CATEGORY_OPTIONS,
} from '../contracts/carbonDesignContract.ts';
import {
  keyStudioWhiteCutout,
  prepareUploadPreview,
  runOnDeviceMlCutout,
} from '../services/backgroundRemovalService.ts';
import { apiFetch } from '../utils/api.ts';
import { localizeApiMessage, tx } from '../utils/i18n.ts';
import { triggerHaptic } from '../utils/nativeBridge.ts';
import {
  BAG_CARRY_STYLES,
  BAG_SUBCATEGORY_SET,
  inferBagCarrySpec,
} from '../shared/garmentTaxonomy.js';
import {
  BOTTOM_LENGTH_OPTIONS,
  FIT_OPTIONS,
  GARMENT_COLOR_SWATCHES,
  GARMENT_MATERIAL_OPTIONS,
  OUTER_CLOSURE_OPTIONS,
  OUTER_LENGTH_OPTIONS,
  QUICK_FIT_NOTES_BY_CATEGORY,
  RISE_OPTIONS,
  SEASON_OPTIONS,
  SHOE_HEEL_OPTIONS,
  SLEEVE_LENGTH_OPTIONS,
  STYLE_MOOD_OPTIONS,
  SUBCATEGORY_OPTIONS_BY_CATEGORY,
  TEXTURE_FEEL_OPTIONS,
  THICKNESS_OPTIONS,
  TOP_NECKLINE_OPTIONS,
  WAIST_TYPE_OPTIONS,
  computeTemperatureRange,
} from '../shared/garmentMetadata.js';
import {
  CompactPreviewBar,
  OfficialProductProposalCard,
} from './GarmentRegistrationBanner.jsx';
import OfficialInfoSyncModal from './OfficialInfoSyncModal.jsx';
import { ResponsiveSheetModal } from './common/AppUI.jsx';
import { buildGarmentRegistrationStepperState } from '../utils/garmentRegistrationStepper.ts';
import {
  formatCareSummaryTokens,
  inferGarmentCareProfile,
  sanitizeGarmentCareProfile,
} from '../utils/garmentCareEngine.ts';

const ACCESSORY_SUBTYPE_OPTIONS = [
  { key: 'bag', ko: '크로스·숄더백', en: 'Crossbody / Shoulder' },
  { key: 'tote', ko: '토트백', en: 'Tote' },
  { key: 'briefcase', ko: '브리프케이스', en: 'Briefcase' },
  { key: 'backpack', ko: '백팩', en: 'Backpack' },
  { key: 'messenger', ko: '메신저백', en: 'Messenger' },
  { key: 'clutch', ko: '클러치', en: 'Clutch' },
  { key: 'duffel', ko: '더플백', en: 'Duffel' },
  { key: 'hobo', ko: '호보백', en: 'Hobo' },
  { key: 'umbrella', ko: '우산 · 양산', en: 'Umbrella' },
  { key: 'watch', ko: '손목시계', en: 'Watch' },
  { key: 'gloves', ko: '장갑', en: 'Gloves' },
  { key: 'eyewear', ko: '아이웨어', en: 'Eyewear' },
  { key: 'headwear', ko: '머리 · 모자', en: 'Headwear' },
  { key: 'neckwear', ko: '목 · 머플러', en: 'Neckwear' },
  { key: 'belt', ko: '허리 · 벨트', en: 'Belt' },
];

const JEWELRY_SUBTYPE_OPTIONS = [
  { key: 'necklace', ko: '목걸이 · 펜던트', en: 'Necklace' },
  { key: 'earring', ko: '귀걸이 · 이어커프', en: 'Earring' },
  { key: 'bracelet', ko: '팔찌 · 뱅글', en: 'Bracelet' },
  { key: 'ring', ko: '반지 · 링', en: 'Ring' },
  { key: 'brooch', ko: '브로치 · 코사지', en: 'Brooch' },
];

const QUICK_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'FREE'];

function AddGarmentForm({ activeCloset, lang = 'ko', onClose, onRegistered, showToast }) {
  const frontGalleryRef = useRef(null);
  const frontCameraRef = useRef(null);
  const backGalleryRef = useRef(null);
  const backCameraRef = useRef(null);
  const tagGalleryRef = useRef(null);
  const tagCameraRef = useRef(null);
  const careLabelGalleryRef = useRef(null);
  const careLabelCameraRef = useRef(null);

  const mountedRef = useRef(true);
  const dirtyFieldsRef = useRef(new Set());
  const cutoutRunIdRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cutoutRunIdRef.current += 1;
    };
  }, []);

  // Step state: 0 = Capture (Front + Back required, Tags optional), 1 = Core, 2 = Wearing Details & Fit, 3 = Purchase & Care
  const [step, setStep] = useState(0);

  // Captured raw compressed previews
  const [frontPreview, setFrontPreview] = useState(null);
  const [backPreview, setBackPreview] = useState(null);
  const [neckTagPreview, setNeckTagPreview] = useState(null);
  const [careLabelPreview, setCareLabelPreview] = useState(null);
  const [loadingSlot, setLoadingSlot] = useState('');

  // Background cutout pipeline state
  const [activePreviewSide, setActivePreviewSide] = useState('front');
  const [showOriginal, setShowOriginal] = useState(false);
  const [frontCutout, setFrontCutout] = useState(null);
  const [backCutout, setBackCutout] = useState(null);
  const [cutoutStatusFront, setCutoutStatusFront] = useState('idle');
  const [cutoutStatusBack, setCutoutStatusBack] = useState('idle');
  const [needsStudioFront, setNeedsStudioFront] = useState(false);
  const [needsStudioBack, setNeedsStudioBack] = useState(false);
  const [studioBusySide, setStudioBusySide] = useState('');
  const [cutoutSource, setCutoutSource] = useState('local_ml');

  // AI analysis + Official Brand DB Lookup & Sync Modal state
  const [analysisStatus, setAnalysisStatus] = useState('idle'); // idle | analyzing | ready | fallback
  const [analysisNote, setAnalysisNote] = useState('');
  const [webLookupStatus, setWebLookupStatus] = useState('idle'); // idle | searching | found | not_found | applied_all | applied_info_only | dismissed
  const [webMatch, setWebMatch] = useState(null);
  const [officialImageCutout, setOfficialImageCutout] = useState(null);
  const [usingOfficialPhoto, setUsingOfficialPhoto] = useState(false);
  const [syncModalOpen, setSyncModalOpen] = useState(false);
  const [labelSearchBusy, setLabelSearchBusy] = useState(false);

  const tagPreviews = useMemo(
    () => [neckTagPreview, careLabelPreview].filter(Boolean),
    [neckTagPreview, careLabelPreview]
  );

  // Step 1: Core attributes
  const [category, setCategory] = useState('bottom');
  const [subcategory, setSubcategory] = useState('trousers');
  const [name, setName] = useState('');
  const [colorName, setColorName] = useState('차콜');
  const [colorHex, setColorHex] = useState('#3B3D42');
  const [material, setMaterial] = useState('Cotton');
  const [textureFeel, setTextureFeel] = useState('soft');
  const [fit, setFit] = useState('relaxed');
  const [hasStrap, setHasStrap] = useState(true);
  const [bagCarryStyle, setBagCarryStyle] = useState('shoulder');

  // Step 2: Wearing details, seasons, mood, fit note
  const [garmentDetails, setGarmentDetails] = useState({});
  const [seasons, setSeasons] = useState(['봄', '가을']);
  const [thickness, setThickness] = useState('medium');
  const [waterResistant, setWaterResistant] = useState(false);
  const [styleMood, setStyleMood] = useState('minimal');
  const [formality, setFormality] = useState('smart');
  const [fitNote, setFitNote] = useState('');

  // Step 3: Optional purchase & care metadata
  const [brand, setBrand] = useState('');
  const [productCode, setProductCode] = useState('');
  const [price, setPrice] = useState('');
  const [purchaseDate, setPurchaseDate] = useState('');
  const [purchaseStore, setPurchaseStore] = useState('');
  const [size, setSize] = useState('');
  const [materialComposition, setMaterialComposition] = useState('');
  const [careTip, setCareTip] = useState('');
  const [careProfileOverride, setCareProfileOverride] = useState(null);
  const [officialSourceUrl, setOfficialSourceUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const effectiveCareProfile = useMemo(() => {
    const inferred = inferGarmentCareProfile({
      name,
      category,
      subcategory,
      fabric: material,
      material_composition: materialComposition,
      color_name: colorName,
      color_hex: colorHex,
      care_tip: careTip,
    });
    if (careProfileOverride) {
      return sanitizeGarmentCareProfile(
        {
          ...careProfileOverride,
          ...(careLabelPreview ? { careLabelImageUrl: careLabelPreview } : {}),
        },
        inferred
      );
    }
    return careLabelPreview
      ? { ...inferred, careLabelImageUrl: careLabelPreview }
      : inferred;
  }, [
    name,
    category,
    subcategory,
    material,
    materialComposition,
    colorName,
    colorHex,
    careTip,
    careProfileOverride,
    careLabelPreview,
  ]);

  const markDirty = (field) => {
    dirtyFieldsRef.current.add(field);
  };

  const categoryOptions = [
    ...WARDROBE_CATEGORY_OPTIONS,
    {
      key: 'jewelry',
      label: tx(lang, '주얼리', 'Jewelry'),
      defaultSubcategory: 'necklace',
    },
  ];

  const isBagSelection =
    category === 'bag' || (category === 'accessory' && BAG_SUBCATEGORY_SET.has(subcategory));

  const subtypeOptions =
    category === 'accessory'
      ? ACCESSORY_SUBTYPE_OPTIONS
      : category === 'jewelry'
        ? JEWELRY_SUBTYPE_OPTIONS
        : SUBCATEGORY_OPTIONS_BY_CATEGORY[category] || null;

  const handleSelectCategory = (nextCat, userTriggered = true) => {
    if (userTriggered) markDirty('category');
    setCategory(nextCat);
    if (nextCat === 'accessory') {
      setSubcategory('bag');
      const inferred = inferBagCarrySpec({ category: 'accessory', subcategory: 'bag' });
      setHasStrap(Boolean(inferred.has_strap));
      setBagCarryStyle(inferred.bag_carry_style || 'shoulder');
      if (userTriggered && !dirtyFieldsRef.current.has('material')) setMaterial('Leather');
    } else if (nextCat === 'jewelry') {
      setSubcategory('necklace');
      if (userTriggered && !dirtyFieldsRef.current.has('material')) setMaterial('18K Yellow Gold');
    } else {
      const defaults = SUBCATEGORY_OPTIONS_BY_CATEGORY[nextCat];
      if (defaults?.[0]) setSubcategory(defaults[0].key);
    }
  };

  const handleSelectSubpart = (nextSub) => {
    markDirty('subcategory');
    setSubcategory(nextSub);
    if (BAG_SUBCATEGORY_SET.has(nextSub)) {
      const inferred = inferBagCarrySpec({ category: 'accessory', subcategory: nextSub });
      setHasStrap(Boolean(inferred.has_strap));
      setBagCarryStyle(inferred.bag_carry_style || 'hand_only');
    }
  };

  const handlePickPhoto = async (slot, event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setLoadingSlot(slot);
    try {
      const maxSide = slot === 'tag' || slot === 'care_label' ? 1280 : 1200;
      const compressed = await prepareUploadPreview(file, maxSide, 0.86);
      if (!mountedRef.current) return;

      if (slot === 'front') {
        setFrontPreview(compressed);
        setFrontCutout(null);
        setCutoutStatusFront('idle');
        setNeedsStudioFront(false);
        setUsingOfficialPhoto(false);
      } else if (slot === 'back') {
        setBackPreview(compressed);
        setBackCutout(null);
        setCutoutStatusBack('idle');
        setNeedsStudioBack(false);
      } else if (slot === 'tag') {
        setNeckTagPreview(compressed);
      } else if (slot === 'care_label') {
        setCareLabelPreview(compressed);
      }
      triggerHaptic('selection');
    } catch (err) {
      showToast?.(
        localizeApiMessage(err?.message, lang) ||
          tx(lang, '사진을 불러오지 못했습니다.', 'Failed to read photo.')
      );
    } finally {
      if (mountedRef.current) setLoadingSlot('');
    }
  };

  const triggerWebLookup = async (params, { openModalOnMatch = false } = {}) => {
    setWebLookupStatus('searching');
    try {
      const res = await apiFetch('/garments/web-lookup', {
        method: 'POST',
        body: JSON.stringify({ ...params, lang }),
      });
      if (!mountedRef.current) return null;
      const match = res?.match;
      if (match?.found) {
        setWebMatch(match);
        setWebLookupStatus('found');
        if (match.official_image_data) {
          keyStudioWhiteCutout(match.official_image_data, { targetSizePx: 640 })
            .then((keyed) => {
              if (mountedRef.current) setOfficialImageCutout(keyed.cutoutDataUrl);
            })
            .catch(() => {
              if (mountedRef.current) setOfficialImageCutout(match.official_image_data);
            });
        }
        if (openModalOnMatch) {
          setSyncModalOpen(true);
        }
        return match;
      } else {
        setWebMatch(null);
        setWebLookupStatus('not_found');
        if (openModalOnMatch) {
          showToast?.(
            tx(
              lang,
              '공식 브랜드 DB에서 일치하는 품번/제품을 찾지 못했습니다. 라벨을 더 선명하게 찍어보세요.',
              'No exact official product found in brand DB. Try a clearer close-up of the label.'
            )
          );
        }
        return null;
      }
    } catch {
      if (mountedRef.current) {
        setWebLookupStatus('not_found');
        if (openModalOnMatch) {
          showToast?.(
            tx(
              lang,
              '공식 브랜드 DB 검색 중 오류가 발생했습니다.',
              'Official brand DB search failed.'
            )
          );
        }
      }
      return null;
    }
  };

  const handleLabelBrandDbSearch = async () => {
    if (labelSearchBusy || webLookupStatus === 'searching') return;
    if (tagPreviews.length === 0 && !brand.trim() && !productCode.trim()) {
      showToast?.(
        tx(
          lang,
          '목탭이나 내부 세탁 케어 라벨 사진을 먼저 촬영·선택해 주세요.',
          'Please capture or select a neck tag or care label photo first.'
        )
      );
      return;
    }

    setLabelSearchBusy(true);
    triggerHaptic('selection');
    try {
      let lookupPayload = {
        brand: brand.trim(),
        product_code: productCode.trim(),
        query: '',
        name: name.trim(),
        category,
        color_name: colorName,
        material,
      };

      if (tagPreviews.length > 0) {
        const visionRes = await apiFetch('/garments/vision-analyze', {
          method: 'POST',
          body: JSON.stringify({
            front_image: frontPreview || null,
            back_image: backPreview || null,
            tag_images: tagPreviews,
            lang,
          }),
        });
        if (!mountedRef.current) return;
        const a = visionRes?.analysis;
        if (a) {
          if (a.brand && !dirtyFieldsRef.current.has('brand')) setBrand(a.brand);
          if (a.product_code && !dirtyFieldsRef.current.has('productCode')) {
            setProductCode(a.product_code);
          }
          if (a.material_composition && !dirtyFieldsRef.current.has('materialComposition')) {
            setMaterialComposition(a.material_composition);
          }
          if (a.size && !dirtyFieldsRef.current.has('size')) setSize(a.size);
          if (a.care_tip && !dirtyFieldsRef.current.has('careTip')) setCareTip(a.care_tip);

          lookupPayload = {
            brand: a.brand || brand.trim(),
            product_code: a.product_code || productCode.trim(),
            query: a.web_search_query || '',
            name: (lang === 'en' ? a.name_en : a.name_ko) || name.trim(),
            category: a.category || category,
            color_name: a.color_name || colorName,
            material: a.material || material,
          };
        }
      }

      await triggerWebLookup(lookupPayload, { openModalOnMatch: true });
    } catch (err) {
      if (mountedRef.current) {
        showToast?.(
          localizeApiMessage(err?.message, lang) ||
            tx(lang, '라벨 분석 및 공식 DB 검색에 실패했습니다.', 'Label scan & brand DB search failed.')
        );
      }
    } finally {
      if (mountedRef.current) setLabelSearchBusy(false);
    }
  };

  // Start Track A (AI Vision Analysis) + Track B (Sequential Cutout Queue: Front -> Back) + Track C (Web Lookup)
  const startAnalysisAndGuidedFlow = () => {
    if (!frontPreview || !backPreview) {
      showToast?.(
        tx(
          lang,
          '앞면과 뒷면 사진 2장을 모두 촬영하거나 선택해주세요.',
          'Please capture or select both front and back photos.'
        )
      );
      return;
    }

    triggerHaptic('medium');
    setStep(1);
    setActivePreviewSide('front');
    setShowOriginal(false);
    const runId = ++cutoutRunIdRef.current;

    // Track B: Sequential non-blocking background cutout queue (Front priority 1 -> Back priority 2)
    (async () => {
      setCutoutStatusFront('processing_local');
      try {
        const frontRes = await runOnDeviceMlCutout(frontPreview, {
          targetSizePx: 640,
          paddingRatio: 0.1,
        });
        if (!mountedRef.current || cutoutRunIdRef.current !== runId) return;
        setFrontCutout(frontRes);
        setCutoutStatusFront('ready_local');
        setCutoutSource(frontRes.providerId === 'ondevice-ml-cutout-v1' ? 'local_ml' : 'client_fast');
        if (frontRes.quality?.needsStudioRefinement) {
          setNeedsStudioFront(true);
        }
      } catch {
        if (!mountedRef.current || cutoutRunIdRef.current !== runId) return;
        setCutoutStatusFront('needs_studio');
        setNeedsStudioFront(true);
      }

      if (!mountedRef.current || cutoutRunIdRef.current !== runId) return;
      setCutoutStatusBack('processing_local');
      try {
        const backRes = await runOnDeviceMlCutout(backPreview, {
          targetSizePx: 640,
          paddingRatio: 0.1,
        });
        if (!mountedRef.current || cutoutRunIdRef.current !== runId) return;
        setBackCutout(backRes);
        setCutoutStatusBack('ready_local');
        if (backRes.quality?.needsStudioRefinement) {
          setNeedsStudioBack(true);
        }
      } catch {
        if (!mountedRef.current || cutoutRunIdRef.current !== runId) return;
        setCutoutStatusBack('needs_studio');
        setNeedsStudioBack(true);
      }
    })();

    // Track A: Immediate server-side Gemini Vision multimodal analysis
    (async () => {
      setAnalysisStatus('analyzing');
      setAnalysisNote('');
      try {
        const res = await apiFetch('/garments/vision-analyze', {
          method: 'POST',
          body: JSON.stringify({
            front_image: frontPreview,
            back_image: backPreview,
            tag_images: tagPreviews,
            lang,
          }),
        });
        if (!mountedRef.current || cutoutRunIdRef.current !== runId) return;
        const a = res?.analysis;
        if (!a) {
          setAnalysisStatus('fallback');
          return;
        }

        const dirty = dirtyFieldsRef.current;
        if (!dirty.has('category') && a.category) {
          handleSelectCategory(a.category, false);
        }
        if (!dirty.has('subcategory') && a.subcategory) {
          setSubcategory(a.subcategory);
        }
        if (!dirty.has('name')) {
          const suggested = lang === 'en' ? a.name_en || a.name_ko : a.name_ko || a.name_en;
          if (suggested) setName(suggested);
        }
        if (!dirty.has('color')) {
          if (a.color_name) setColorName(a.color_name);
          if (a.color_hex) setColorHex(a.color_hex);
        }
        if (!dirty.has('material') && a.material) setMaterial(a.material);
        if (!dirty.has('textureFeel') && a.texture_feel) setTextureFeel(a.texture_feel);
        if (!dirty.has('fit') && a.fit) setFit(a.fit);
        if (!dirty.has('seasons') && Array.isArray(a.seasons) && a.seasons.length > 0) {
          setSeasons(a.seasons);
        }
        if (!dirty.has('thickness') && a.thickness) setThickness(a.thickness);
        if (!dirty.has('waterResistant')) setWaterResistant(Boolean(a.water_resistant));
        if (!dirty.has('styleMood') && a.style_mood) setStyleMood(a.style_mood);
        if (!dirty.has('formality') && a.formality) setFormality(a.formality);
        if (!dirty.has('garmentDetails') && a.garment_details) {
          setGarmentDetails(a.garment_details);
        }
        if (!dirty.has('fitNote') && a.suggested_fit_note) {
          setFitNote(a.suggested_fit_note);
        }
        if (!dirty.has('brand') && a.brand) setBrand(a.brand);
        if (!dirty.has('productCode') && a.product_code) setProductCode(a.product_code);
        if (!dirty.has('size') && a.size) setSize(a.size);
        if (!dirty.has('materialComposition') && a.material_composition) {
          setMaterialComposition(a.material_composition);
        }
        if (!dirty.has('careTip') && a.care_tip) setCareTip(a.care_tip);
        if (!dirty.has('careProfile') && a.care_profile && typeof a.care_profile === 'object') {
          setCareProfileOverride(
            sanitizeGarmentCareProfile({
              ...a.care_profile,
              source: careLabelPreview ? 'care_label_scan' : a.care_profile.source || 'inferred',
              ...(careLabelPreview ? { careLabelImageUrl: careLabelPreview } : {}),
            })
          );
        }

        if (a.background_quality?.hasClutterOrBodyPart) {
          setNeedsStudioFront(true);
          setNeedsStudioBack(true);
        }

        setAnalysisStatus('ready');
        setAnalysisNote(
          a.has_tag_images
            ? tx(
                lang,
                '앞·뒤 사진과 탭 정보를 바탕으로 기본값을 채웠어요.',
                'Pre-filled defaults from front, back, and tag photos.'
              )
            : tx(
                lang,
                '앞·뒤 사진을 분석해 기본값을 채웠어요. 틀린 항목만 톡톡 수정하세요.',
                'Pre-filled defaults from front & back photos. Tap any field to adjust.'
              )
        );

        // Track C: Trigger Official Web Product Lookup when tags or identifiable brand/code exist
        if (a.has_identifiable_product || tagPreviews.length > 0) {
          triggerWebLookup({
            brand: a.brand || '',
            product_code: a.product_code || '',
            query: a.web_search_query || '',
            name: lang === 'en' ? a.name_en : a.name_ko,
            category: a.category,
            color_name: a.color_name,
            material: a.material,
          });
        }
      } catch (err) {
        if (!mountedRef.current || cutoutRunIdRef.current !== runId) return;
        setAnalysisStatus('fallback');
        setAnalysisNote(
          localizeApiMessage(err?.message, lang) ||
            tx(
              lang,
              'AI 분석에 실패해 수동 입력 모드로 전환했습니다.',
              'AI analysis unavailable; please review fields manually.'
            )
        );
      }
    })();
  };

  const handleRunStudioRefinement = async (side = activePreviewSide) => {
    const sourceImg = side === 'back' ? backPreview : frontPreview;
    if (!sourceImg || studioBusySide) return;

    setStudioBusySide(side);
    if (side === 'front') setCutoutStatusFront('processing_studio');
    else setCutoutStatusBack('processing_studio');

    try {
      const res = await apiFetch('/garments/studio-cutout', {
        method: 'POST',
        body: JSON.stringify({
          image_data: sourceImg,
          category,
          side,
          color_name: colorName,
          material,
        }),
      });
      if (!mountedRef.current) return;
      if (!res?.studioImageDataUrl) {
        throw new Error(tx(lang, '보정 이미지를 받지 못했습니다.', 'Missing refined image.'));
      }
      const keyed = await keyStudioWhiteCutout(res.studioImageDataUrl, {
        targetSizePx: 640,
        paddingRatio: 0.09,
      });
      if (!mountedRef.current) return;

      if (side === 'front') {
        setFrontCutout(keyed);
        setCutoutStatusFront('ready_studio');
        setNeedsStudioFront(false);
        setUsingOfficialPhoto(false);
        setCutoutSource('ai_studio');
      } else {
        setBackCutout(keyed);
        setCutoutStatusBack('ready_studio');
        setNeedsStudioBack(false);
      }
      setShowOriginal(false);
      triggerHaptic('medium');
      showToast?.(
        tx(lang, 'AI 스튜디오 누끼 보정이 완료되었어요.', 'AI Studio cutout complete.')
      );
    } catch (err) {
      if (mountedRef.current) {
        if (side === 'front') setCutoutStatusFront(frontCutout ? 'ready_local' : 'needs_studio');
        else setCutoutStatusBack(backCutout ? 'ready_local' : 'needs_studio');
        showToast?.(
          localizeApiMessage(err?.message, lang) ||
            tx(lang, 'AI 스튜디오 보정에 실패했습니다.', 'AI Studio cutout failed.')
        );
      }
    } finally {
      if (mountedRef.current) setStudioBusySide('');
    }
  };

  const applyOfficialMatchFields = (includePhoto) => {
    if (!webMatch) return;
    if (webMatch.official_name) setName(webMatch.official_name);
    if (webMatch.brand) setBrand(webMatch.brand);
    if (webMatch.product_code) setProductCode(webMatch.product_code);
    if (webMatch.color_name) setColorName(webMatch.color_name);
    if (webMatch.material) setMaterial(webMatch.material);
    if (webMatch.material_composition) setMaterialComposition(webMatch.material_composition);
    if (webMatch.fit) setFit(webMatch.fit);
    if (webMatch.retail_price_krw > 0 && !price) setPrice(String(webMatch.retail_price_krw));
    if (webMatch.purchase_store && !purchaseStore) setPurchaseStore(webMatch.purchase_store);
    if (webMatch.care_tip) setCareTip(webMatch.care_tip);
    if (webMatch.fit_summary && !fitNote) setFitNote(webMatch.fit_summary);
    if (webMatch.official_source_url) setOfficialSourceUrl(webMatch.official_source_url);

    if (includePhoto && (officialImageCutout || webMatch.official_image_data)) {
      setUsingOfficialPhoto(true);
      setActivePreviewSide('front');
      setShowOriginal(false);
      setCutoutSource('official_web');
      setWebLookupStatus('applied_all');
      showToast?.(
        tx(
          lang,
          '공식 상품 사진과 정보를 모두 반영했어요. 내 앞·뒤 실사도 함께 보관됩니다.',
          'Applied official photo & specs. Your original photos are kept safely too.'
        )
      );
    } else {
      setWebLookupStatus('applied_info_only');
      showToast?.(
        tx(lang, '공식 상품 정보를 반영했어요.', 'Applied official product specs.')
      );
    }
    triggerHaptic('medium');
  };

  const handleConfirmSyncModal = ({ patch, applyOfficialPhoto, appliedCount }) => {
    if (patch.name) {
      markDirty('name');
      setName(patch.name);
    }
    if (patch.brand) {
      markDirty('brand');
      setBrand(patch.brand);
    }
    if (patch.productCode) {
      markDirty('productCode');
      setProductCode(patch.productCode);
    }
    if (patch.colorName) {
      markDirty('color');
      setColorName(patch.colorName);
    }
    if (patch.material) {
      markDirty('material');
      setMaterial(patch.material);
    }
    if (patch.materialComposition) {
      markDirty('materialComposition');
      setMaterialComposition(patch.materialComposition);
    }
    if (patch.fit) {
      markDirty('fit');
      setFit(patch.fit);
    }
    if (patch.price) {
      setPrice(patch.price);
    }
    if (patch.purchaseStore) {
      setPurchaseStore(patch.purchaseStore);
    }
    if (patch.careTip) {
      markDirty('careTip');
      setCareTip(patch.careTip);
    }
    if (patch.fitNote) {
      markDirty('fitNote');
      setFitNote(patch.fitNote);
    }
    if (patch.officialSourceUrl) {
      setOfficialSourceUrl(patch.officialSourceUrl);
    }

    if (applyOfficialPhoto && (officialImageCutout || webMatch?.official_image_data)) {
      setUsingOfficialPhoto(true);
      setActivePreviewSide('front');
      setShowOriginal(false);
      setCutoutSource('official_web');
      setWebLookupStatus('applied_all');
    } else if (appliedCount > 0) {
      setWebLookupStatus('applied_info_only');
    }

    triggerHaptic('medium');
    showToast?.(
      tx(
        lang,
        `공식 브랜드 DB 정보 ${appliedCount}개 항목을 자동 업데이트했어요.`,
        `Synced ${appliedCount} official brand specifications.`
      )
    );
  };

  const handleToggleSeason = (seasonKey) => {
    markDirty('seasons');
    setSeasons((prev) => {
      if (prev.includes(seasonKey)) {
        return prev.length > 1 ? prev.filter((s) => s !== seasonKey) : prev;
      }
      return [...prev, seasonKey];
    });
  };

  const updateDetailField = (key, value) => {
    markDirty('garmentDetails');
    setGarmentDetails((prev) => {
      const next = { ...prev, [key]: value };
      if (key === 'waist_type') {
        const opt = WAIST_TYPE_OPTIONS.find((o) => o.key === value);
        if (opt) next.belt_compatible = opt.defaultBelt;
      }
      return next;
    });
  };

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    if (!frontPreview || !backPreview) {
      showToast?.(
        tx(lang, '앞면과 뒷면 사진 2장이 모두 필요합니다.', 'Both front and back photos are required.')
      );
      setStep(0);
      return;
    }

    const fallbackLabel = `${colorName} ${material}`.trim() || tx(lang, '새 아이템', 'New Garment');
    const trimmedName = name.trim() || fallbackLabel;

    setSubmitting(true);
    try {
      const catOption =
        categoryOptions.find((opt) => opt.key === category) || categoryOptions[0];
      const resolvedSubcategory = subcategory || catOption.defaultSubcategory;
      const targetOwner = !activeCloset || activeCloset === 'all' ? 'sample' : activeCloset;
      const tempRange = computeTemperatureRange(seasons, thickness);

      const primaryFrontImage =
        usingOfficialPhoto && (officialImageCutout || webMatch?.official_image_data)
          ? officialImageCutout || webMatch.official_image_data
          : frontCutout?.cutoutDataUrl || frontPreview;

      const resolvedBackImage = backCutout?.cutoutDataUrl || backPreview;
      const preservedOriginalFront = usingOfficialPhoto
        ? frontCutout?.cutoutDataUrl || frontPreview
        : null;

      const res = await apiFetch('/garments', {
        method: 'POST',
        body: JSON.stringify({
          closet_owner: targetOwner,
          name: trimmedName,
          brand: brand.trim(),
          category: catOption.key,
          subcategory: resolvedSubcategory,
          fabric: material,
          fit,
          texture_feel: textureFeel,
          material_composition: materialComposition.trim(),
          color_hex: colorHex,
          color_name: colorName.trim() || '차콜',
          seasons,
          thickness,
          min_temp: tempRange.min_temp,
          max_temp: tempRange.max_temp,
          water_resistant: waterResistant,
          formality,
          style_mood: styleMood,
          size: size.trim(),
          price: Math.max(0, Number(String(price).replace(/[^0-9]/g, '')) || 0),
          purchase_date: purchaseDate.trim(),
          purchase_store: purchaseStore.trim(),
          product_code: productCode.trim(),
          care_tip: careTip.trim(),
          fit_note: fitNote.trim(),
          notes: fitNote.trim(),
          garment_details: {
            ...(garmentDetails && typeof garmentDetails === 'object' ? garmentDetails : {}),
            care_profile: {
              ...effectiveCareProfile,
              ...(careLabelPreview ? { careLabelImageUrl: careLabelPreview } : {}),
            },
          },
          official_source_url: officialSourceUrl.trim(),
          cutout_source: usingOfficialPhoto ? 'official_web' : cutoutSource,
          image_data: primaryFrontImage,
          back_image_data: resolvedBackImage,
          ...(preservedOriginalFront ? { original_front_data: preservedOriginalFront } : {}),
          custom_texture: true,
          ...(isBagSelection
            ? {
                has_strap: hasStrap,
                bag_carry_style: hasStrap ? bagCarryStyle : 'hand_only',
              }
            : {}),
        }),
      });

      triggerHaptic('medium');
      onRegistered?.(res?.garment);
      onClose?.();
    } catch (err) {
      showToast?.(
        localizeApiMessage(err?.message, lang) ||
          tx(lang, '등록 중 오류가 발생했습니다.', 'Failed to save item.')
      );
    } finally {
      setSubmitting(false);
    }
  };

  const quickFitNotes = QUICK_FIT_NOTES_BY_CATEGORY[category] || QUICK_FIT_NOTES_BY_CATEGORY.top;

  const hasOfficialSync =
    webLookupStatus === 'applied_all' || webLookupStatus === 'applied_info_only';

  const stepperState = useMemo(
    () =>
      buildGarmentRegistrationStepperState({
        hasFront: Boolean(frontPreview),
        hasBack: Boolean(backPreview),
        hasNeckTag: Boolean(neckTagPreview),
        hasCareLabel: Boolean(careLabelPreview),
        hasOfficialSync,
        currentFormStep: step,
        lang,
      }),
    [frontPreview, backPreview, neckTagPreview, careLabelPreview, hasOfficialSync, step, lang]
  );

  const currentSyncValues = useMemo(
    () => ({
      name,
      brand,
      productCode,
      colorName,
      material,
      materialComposition,
      fit,
      price,
      purchaseStore,
      careTip,
      fitNote,
    }),
    [
      name,
      brand,
      productCode,
      colorName,
      material,
      materialComposition,
      fit,
      price,
      purchaseStore,
      careTip,
      fitNote,
    ]
  );

  return (
    <form onSubmit={handleSubmit} className="hig-add-garment-form hig-guided-reg-form">
      {/* Hidden File Inputs — indices 0..5 preserved for E2E & CARBON_DOM_CONTRACT compatibility */}
      <input
        id={CARBON_DOM_CONTRACT.wardrobeGalleryInputId}
        ref={frontGalleryRef}
        type="file"
        accept="image/*"
        onChange={(e) => handlePickPhoto('front', e)}
        className="sr-only-input"
      />
      <input
        id={CARBON_DOM_CONTRACT.wardrobeCameraInputId}
        ref={frontCameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => handlePickPhoto('front', e)}
        className="sr-only-input"
      />
      <input
        ref={backGalleryRef}
        type="file"
        accept="image/*"
        onChange={(e) => handlePickPhoto('back', e)}
        className="sr-only-input"
      />
      <input
        ref={backCameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => handlePickPhoto('back', e)}
        className="sr-only-input"
      />
      <input
        ref={tagGalleryRef}
        type="file"
        accept="image/*"
        onChange={(e) => handlePickPhoto('tag', e)}
        className="sr-only-input"
      />
      <input
        ref={tagCameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => handlePickPhoto('tag', e)}
        className="sr-only-input"
      />
      <input
        ref={careLabelGalleryRef}
        type="file"
        accept="image/*"
        onChange={(e) => handlePickPhoto('care_label', e)}
        className="sr-only-input"
      />
      <input
        ref={careLabelCameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => handlePickPhoto('care_label', e)}
        className="sr-only-input"
      />

      {/* ==================== TOP VISUAL CAPTURE & REGISTRATION STEPPER ==================== */}
      <nav
        className="hig-reg-top-stepper"
        data-garment-capture-stepper="true"
        aria-label={tx(lang, '의류 촬영 및 등록 진행 단계', 'Garment capture and registration progress')}
      >
        <div className="hig-reg-stepper-head">
          <span className="hig-reg-stepper-title">
            {tx(lang, '촬영 · 등록 진행 현황', 'Capture Progress')}
          </span>
          <span className="hig-reg-stepper-counter tabular-nums">
            {tx(
              lang,
              `필수 사진 ${stepperState.requiredCapturedCount}/${stepperState.requiredTotalCount}`,
              `Required ${stepperState.requiredCapturedCount}/${stepperState.requiredTotalCount}`
            )}
          </span>
        </div>

        <div className="hig-reg-stepper-track" aria-hidden="true">
          <div
            className="hig-reg-stepper-track-fill"
            style={{ width: `${stepperState.progressPct}%` }}
          />
        </div>

        <ol className="hig-reg-stepper-list">
          {stepperState.stages.map((stage) => {
            const isDone = stage.status === 'done';
            const isActive = stage.status === 'active';
            const clickable =
              (stage.id === 'front' || stage.id === 'back' || stage.id === 'label') && step > 0;
            return (
              <li
                key={stage.id}
                className={`hig-reg-stepper-node is-${stage.status}`}
                data-stepper-stage={stage.id}
                data-stepper-status={stage.status}
              >
                <button
                  type="button"
                  className="hig-reg-stepper-node-btn"
                  disabled={!clickable && !(stage.id === 'save' && stepperState.canSave && step === 0)}
                  onClick={() => {
                    if (clickable) setStep(0);
                    else if (stage.id === 'save' && stepperState.canSave && step === 0) {
                      startAnalysisAndGuidedFlow();
                    }
                  }}
                >
                  <span className="hig-reg-stepper-dot tabular-nums">
                    {isDone ? <Check size={11} strokeWidth={2.8} /> : stage.index}
                  </span>
                  <span className="hig-reg-stepper-label">
                    {stage.shortLabel}
                    {stage.required && !isDone && (
                      <span className="hig-reg-stepper-req" aria-hidden="true">*</span>
                    )}
                  </span>
                  {isActive && <span className="sr-only">{tx(lang, '현재 단계', 'Current step')}</span>}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      {/* ==================== STEP 0: MANDATORY FRONT + BACK + OPTIONAL TAG CAPTURE ==================== */}
      {step === 0 && (
        <div className="hig-capture-step" id={CARBON_DOM_CONTRACT.addGarmentPreviewId}>
          {/* Mandatory Front 1 + Back 1 Capture Guide Banner */}
          <div
            className={`hig-mandatory-guide-banner ${stepperState.canSave ? 'is-complete' : ''}`}
            data-front-back-guide="true"
            role="status"
            aria-live="polite"
          >
            <div className="hig-mandatory-guide-top">
              <div className="hig-mandatory-guide-title">
                {stepperState.canSave ? <ShieldCheck size={15} /> : <Lock size={14} />}
                <span>
                  {tx(
                    lang,
                    '필수 촬영 가이드 · 앞면 1장 + 뒷면 1장',
                    'Required Capture Guide · 1 Front + 1 Back'
                  )}
                </span>
              </div>
              <div className="hig-mandatory-guide-chips tabular-nums">
                <span className={`hig-guide-chip ${frontPreview ? 'is-done' : ''}`}>
                  {frontPreview ? <Check size={11} /> : null}
                  {tx(lang, '앞면 1장', 'Front 1')}
                </span>
                <span className={`hig-guide-chip ${backPreview ? 'is-done' : ''}`}>
                  {backPreview ? <Check size={11} /> : null}
                  {tx(lang, '뒷면 1장', 'Back 1')}
                </span>
              </div>
            </div>
            <p className="hig-capture-lead">
              {stepperState.canSave
                ? tx(
                    lang,
                    '앞·뒷면 필수 사진 2장이 모두 준비되었어요. 바로 저장하거나 AI 자동 분석으로 상세 정보를 채워보세요.',
                    'Both required photos are ready. Save now or launch AI Guided Registration to auto-fill specs.'
                  )
                : tx(
                    lang,
                    '정확한 360° 가상 피팅과 핏 분석을 위해 앞면 1장과 뒷면 1장을 평평하게 펼쳐 모두 촬영해 주세요. 두 장이 모두 등록되어야 저장 버튼이 활성화됩니다.',
                    'Lay the garment flat and capture both 1 front and 1 back photo for accurate 360° virtual try-on. Save unlocks once both photos are added.'
                  )}
            </p>
          </div>

          <div className="hig-capture-dual-grid">
            {/* Slot 1: Front (Required) */}
            <div className={`hig-capture-slot-card ${frontPreview ? 'is-filled' : 'is-next'}`}>
              <div className="hig-capture-slot-header">
                <span className="hig-capture-slot-title">
                  {tx(lang, '1. 앞면 사진', '1. Front View')}
                </span>
                <span className={`hig-capture-required-dot ${frontPreview ? 'is-done' : ''}`}>
                  {frontPreview ? tx(lang, '필수 · 완료', 'Required · Done') : tx(lang, '필수 1장', 'Required')}
                </span>
              </div>

              <div className="hig-capture-slot-stage">
                {loadingSlot === 'front' ? (
                  <Loader2 size={24} className="hig-spin" />
                ) : frontPreview ? (
                  <>
                    <img src={frontPreview} alt={tx(lang, '앞면 미리보기', 'Front preview')} />
                    <button
                      type="button"
                      className="hig-capture-retake-btn"
                      onClick={() => frontGalleryRef.current?.click()}
                    >
                      {tx(lang, '변경', 'Change')}
                    </button>
                  </>
                ) : (
                  <div className="hig-capture-slot-actions">
                    <button
                      type="button"
                      className="hig-capture-mini-cta"
                      onClick={() => frontCameraRef.current?.click()}
                    >
                      <Camera size={16} />
                      <span>{tx(lang, '촬영', 'Camera')}</span>
                    </button>
                    <button
                      type="button"
                      className="hig-capture-mini-cta is-subtle"
                      onClick={() => frontGalleryRef.current?.click()}
                    >
                      <ImagePlus size={16} />
                      <span>{tx(lang, '앨범', 'Library')}</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Slot 2: Back (Required) */}
            <div
              className={`hig-capture-slot-card ${backPreview ? 'is-filled' : frontPreview ? 'is-next' : ''}`}
            >
              <div className="hig-capture-slot-header">
                <span className="hig-capture-slot-title">
                  {tx(lang, '2. 뒷면 사진', '2. Back View')}
                </span>
                <span className={`hig-capture-required-dot ${backPreview ? 'is-done' : ''}`}>
                  {backPreview ? tx(lang, '필수 · 완료', 'Required · Done') : tx(lang, '필수 1장', 'Required')}
                </span>
              </div>

              <div className="hig-capture-slot-stage">
                {loadingSlot === 'back' ? (
                  <Loader2 size={24} className="hig-spin" />
                ) : backPreview ? (
                  <>
                    <img src={backPreview} alt={tx(lang, '뒷면 미리보기', 'Back preview')} />
                    <button
                      type="button"
                      className="hig-capture-retake-btn"
                      onClick={() => backGalleryRef.current?.click()}
                    >
                      {tx(lang, '변경', 'Change')}
                    </button>
                  </>
                ) : (
                  <div className="hig-capture-slot-actions">
                    <button
                      type="button"
                      className="hig-capture-mini-cta"
                      onClick={() => backCameraRef.current?.click()}
                    >
                      <Camera size={16} />
                      <span>{tx(lang, '촬영', 'Camera')}</span>
                    </button>
                    <button
                      type="button"
                      className="hig-capture-mini-cta is-subtle"
                      onClick={() => backGalleryRef.current?.click()}
                    >
                      <ImagePlus size={16} />
                      <span>{tx(lang, '앨범', 'Library')}</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Slot 3: Optional Neck Tag & Internal Wash Care Label -> Official Brand DB Lookup */}
          <div className="hig-tag-capture-card" data-label-capture-section="true">
            <div className="hig-tag-capture-head">
              <div className="hig-tag-capture-title-group">
                <Tag size={15} />
                <div>
                  <span className="hig-tag-capture-title">
                    {tx(
                      lang,
                      '목탭 · 내부 세탁 케어 라벨 촬영 (선택 · 공식 브랜드 DB 매칭)',
                      'Neck Tag & Internal Care Label (Optional · Official Brand DB)'
                    )}
                  </span>
                  <p className="hig-tag-capture-desc">
                    {tx(
                      lang,
                      '목탭이나 내부 세탁 케어 라벨을 찍으면 공식 브랜드 DB에서 브랜드·품번·혼용률과 깔끔한 제품 사진을 찾아 동기화 모달로 제안해 드려요.',
                      'Capture the neck tag or internal wash care label to match brand, SKU, fiber composition & clean official photos.'
                    )}
                  </p>
                </div>
              </div>
            </div>

            <div className="hig-label-dual-slots">
              {/* Sub-slot A: Neck Tag */}
              <div className={`hig-label-slot-box ${neckTagPreview ? 'is-filled' : ''}`}>
                <div className="hig-label-slot-head">
                  <span>{tx(lang, '목탭 (브랜드·라인)', 'Neck Tag')}</span>
                  {neckTagPreview && <Check size={12} />}
                </div>
                {neckTagPreview ? (
                  <div className="hig-tag-thumb-item">
                    <img src={neckTagPreview} alt={tx(lang, '목탭 사진', 'Neck tag photo')} />
                    <button
                      type="button"
                      className="hig-tag-remove-btn"
                      aria-label={tx(lang, '목탭 사진 삭제', 'Remove neck tag photo')}
                      onClick={() => setNeckTagPreview(null)}
                    >
                      <X size={12} />
                    </button>
                  </div>
                ) : (
                  <div className="hig-tag-add-buttons">
                    <button
                      type="button"
                      className="hig-reg-mini-btn"
                      disabled={loadingSlot === 'tag'}
                      onClick={() => tagCameraRef.current?.click()}
                    >
                      {loadingSlot === 'tag' ? (
                        <Loader2 size={13} className="hig-spin" />
                      ) : (
                        <Camera size={13} />
                      )}
                      <span>{tx(lang, '촬영', 'Snap')}</span>
                    </button>
                    <button
                      type="button"
                      className="hig-reg-mini-btn"
                      disabled={loadingSlot === 'tag'}
                      onClick={() => tagGalleryRef.current?.click()}
                    >
                      <Plus size={13} />
                      <span>{tx(lang, '앨범', 'Album')}</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Sub-slot B: Internal Wash Care Label */}
              <div className={`hig-label-slot-box ${careLabelPreview ? 'is-filled' : ''}`}>
                <div className="hig-label-slot-head">
                  <span>{tx(lang, '내부 세탁 케어 라벨 (품번·혼용률)', 'Care Label (SKU & Fiber)')}</span>
                  {careLabelPreview && <Check size={12} />}
                </div>
                {careLabelPreview ? (
                  <div className="hig-tag-thumb-item">
                    <img
                      src={careLabelPreview}
                      alt={tx(lang, '내부 세탁 케어 라벨 사진', 'Care label photo')}
                    />
                    <button
                      type="button"
                      className="hig-tag-remove-btn"
                      aria-label={tx(lang, '세탁 라벨 사진 삭제', 'Remove care label photo')}
                      onClick={() => setCareLabelPreview(null)}
                    >
                      <X size={12} />
                    </button>
                  </div>
                ) : (
                  <div className="hig-tag-add-buttons">
                    <button
                      type="button"
                      className="hig-reg-mini-btn"
                      disabled={loadingSlot === 'care_label'}
                      onClick={() => careLabelCameraRef.current?.click()}
                    >
                      {loadingSlot === 'care_label' ? (
                        <Loader2 size={13} className="hig-spin" />
                      ) : (
                        <Camera size={13} />
                      )}
                      <span>{tx(lang, '촬영', 'Snap')}</span>
                    </button>
                    <button
                      type="button"
                      className="hig-reg-mini-btn"
                      disabled={loadingSlot === 'care_label'}
                      onClick={() => careLabelGalleryRef.current?.click()}
                    >
                      <Plus size={13} />
                      <span>{tx(lang, '앨범', 'Album')}</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Direct Official Brand DB Lookup Trigger on Step 0 */}
            <div className="hig-label-db-action-row">
              <button
                type="button"
                className="hig-web-manual-search-btn"
                data-label-brand-db-search-btn="true"
                disabled={tagPreviews.length === 0 || labelSearchBusy || webLookupStatus === 'searching'}
                onClick={handleLabelBrandDbSearch}
              >
                {labelSearchBusy || webLookupStatus === 'searching' ? (
                  <Loader2 size={14} className="hig-spin" />
                ) : (
                  <Search size={14} />
                )}
                <span>
                  {labelSearchBusy || webLookupStatus === 'searching'
                    ? tx(lang, '라벨 판독 및 공식 브랜드 DB 검색 중...', 'Scanning label & searching brand DB...')
                    : tx(lang, '촬영한 라벨로 공식 브랜드 DB 검색', 'Search Official Brand DB from Label')}
                </span>
              </button>

              {webMatch?.found && (
                <button
                  type="button"
                  className="hig-reg-mini-btn active"
                  onClick={() => setSyncModalOpen(true)}
                >
                  <Sparkles size={13} />
                  <span>{tx(lang, '정보 동기화 모달 열기', 'Open Sync Modal')}</span>
                </button>
              )}
            </div>
          </div>

          {/* Step 0 Action Row: AI Guided Next CTA + Explicitly Locked Save Button */}
          <div className="hig-capture-submit-stack">
            <button
              type="button"
              className="hig-primary-cta-btn"
              disabled={!stepperState.canSave || Boolean(loadingSlot)}
              onClick={startAnalysisAndGuidedFlow}
            >
              <Sparkles size={17} />
              <span>
                {!frontPreview
                  ? tx(lang, '1. 앞면 사진을 먼저 선택해주세요', '1. Select front photo first')
                  : !backPreview
                    ? tx(lang, '2. 뒷면 사진도 한 장 선택해주세요', '2. Select back photo too')
                    : tx(lang, 'AI 자동 분석 & 등록 가이드 시작', 'Start AI Guided Registration')}
              </span>
              {stepperState.canSave && <ArrowRight size={16} />}
            </button>

            <button
              type="submit"
              className="hig-capture-save-btn"
              data-step0-save-btn="true"
              disabled={!stepperState.canSave || submitting || Boolean(loadingSlot)}
            >
              {stepperState.canSave ? <Check size={15} /> : <Lock size={14} />}
              <span>
                {submitting
                  ? tx(lang, '옷장에 저장 중...', 'Saving...')
                  : stepperState.canSave
                    ? tx(lang, '앞·뒷면 사진으로 바로 저장', 'Save Now with Front & Back')
                    : tx(lang, '저장 (앞면 1장 + 뒷면 1장 필수)', 'Save Locked (Front + Back Required)')}
              </span>
            </button>
          </div>
        </div>
      )}

      {/* ==================== STEPS 1-3: STICKY PREVIEW + WEB PROPOSAL + GUIDED FORM ==================== */}
      {step > 0 && (
        <>
          <CompactPreviewBar
            lang={lang}
            activeSide={activePreviewSide}
            onChangeSide={setActivePreviewSide}
            showOriginal={showOriginal}
            onToggleOriginal={() => setShowOriginal((v) => !v)}
            frontOriginal={frontPreview}
            backOriginal={backPreview}
            frontCutout={frontCutout}
            backCutout={backCutout}
            officialImageCutout={officialImageCutout}
            usingOfficialPhoto={usingOfficialPhoto}
            onToggleOfficialPhoto={() => setUsingOfficialPhoto((v) => !v)}
            cutoutStatusFront={cutoutStatusFront}
            cutoutStatusBack={cutoutStatusBack}
            needsStudioFront={needsStudioFront}
            needsStudioBack={needsStudioBack}
            studioBusySide={studioBusySide}
            onRunStudioRefinement={handleRunStudioRefinement}
            category={category}
            colorHex={colorHex}
            colorName={colorName}
            name={name}
            analysisStatus={analysisStatus}
          />

          <OfficialProductProposalCard
            lang={lang}
            webLookupStatus={webLookupStatus}
            webMatch={webMatch}
            onApplyAll={() => applyOfficialMatchFields(true)}
            onApplyInfoOnly={() => applyOfficialMatchFields(false)}
            onOpenSyncModal={() => setSyncModalOpen(true)}
            onDismiss={() => setWebLookupStatus('dismissed')}
            onRunStudioInstead={() => handleRunStudioRefinement('front')}
          />

          {/* Step Indicator Bar */}
          <div className="hig-step-bar" role="tablist" aria-label={tx(lang, '등록 단계', 'Registration steps')}>
            {[
              { id: 1, ko: '1. 핵심 확인', en: '1. Core' },
              { id: 2, ko: '2. 착용·피팅', en: '2. Fit & Style' },
              { id: 3, ko: '3. 구매·관리', en: '3. Purchase' },
            ].map((s) => (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={step === s.id}
                className={`hig-step-tab ${step === s.id ? 'active' : step > s.id ? 'done' : ''}`}
                onClick={() => setStep(s.id)}
              >
                {tx(lang, s.ko, s.en)}
              </button>
            ))}
          </div>

          {/* Subtle single-line AI status readout */}
          {analysisStatus === 'analyzing' ? (
            <div className="hig-ai-status-line" role="status" aria-live="polite">
              <Loader2 size={14} className="hig-spin" />
              <span>
                {tx(
                  lang,
                  'AI가 앞·뒤 사진을 분석해 기본값을 채우고 있어요 (먼저 수정하셔도 유지됩니다)',
                  'AI is pre-filling defaults from your photos (your edits are preserved)'
                )}
              </span>
            </div>
          ) : analysisNote ? (
            <div className="hig-ai-status-line is-ready">
              <Sparkles size={13} />
              <span>{analysisNote}</span>
            </div>
          ) : null}

          {/* -------------------- STEP 1: CORE ATTRIBUTES -------------------- */}
          {step === 1 && (
            <div className="hig-step-panel">
              {/* Category */}
              <div className="hig-field-group">
                <label className="hig-field-label">{tx(lang, '카테고리', 'Category')}</label>
                <div className="hig-pill-row" role="radiogroup" aria-label="Category">
                  {categoryOptions.map((opt) => {
                    const selected = category === opt.key;
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        className={`hig-filter-pill ${selected ? 'active' : ''}`}
                        onClick={() => handleSelectCategory(opt.key, true)}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Subcategory */}
              {subtypeOptions && (
                <div className="hig-field-group">
                  <label className="hig-field-label">
                    {tx(lang, '세부 분류', 'Subcategory')}
                  </label>
                  <div className="hig-pill-row" data-add-subpart-group={category}>
                    {subtypeOptions.map((opt) => {
                      const selected = subcategory === opt.key;
                      return (
                        <button
                          key={opt.key}
                          type="button"
                          data-add-subpart-btn={opt.key}
                          aria-pressed={selected}
                          className={`hig-filter-pill ${selected ? 'active' : ''}`}
                          onClick={() => handleSelectSubpart(opt.key)}
                        >
                          {tx(lang, opt.ko, opt.en)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Bag strap & carry style */}
              {isBagSelection && (
                <div className="hig-field-group" data-add-bag-strap-group="true">
                  <label className="hig-field-label">
                    {tx(lang, '가방끈 유무 · 착용 방식', 'Bag Strap & Carry Style')}
                  </label>
                  <div className="hig-grid-2" style={{ marginBottom: 8 }}>
                    <button
                      type="button"
                      className={`hig-filter-pill ${hasStrap ? 'active' : ''}`}
                      aria-pressed={hasStrap}
                      onClick={() => {
                        setHasStrap(true);
                        if (bagCarryStyle === 'hand_only') setBagCarryStyle('shoulder');
                      }}
                    >
                      {tx(lang, '가방끈 있음', 'Has Strap')}
                    </button>
                    <button
                      type="button"
                      className={`hig-filter-pill ${!hasStrap ? 'active' : ''}`}
                      aria-pressed={!hasStrap}
                      onClick={() => {
                        setHasStrap(false);
                        setBagCarryStyle('hand_only');
                      }}
                    >
                      {tx(lang, '가방끈 없음 (핸드캐리)', 'No Strap (Hand-carry)')}
                    </button>
                  </div>
                  {hasStrap && (
                    <div className="hig-pill-row">
                      {Object.values(BAG_CARRY_STYLES)
                        .filter((s) => s.hasStrap)
                        .map((styleOpt) => (
                          <button
                            key={styleOpt.key}
                            type="button"
                            className={`hig-filter-pill ${bagCarryStyle === styleOpt.key ? 'active' : ''}`}
                            onClick={() => setBagCarryStyle(styleOpt.key)}
                          >
                            {lang === 'en' ? styleOpt.labelEn : styleOpt.labelKo}
                          </button>
                        ))}
                    </div>
                  )}
                </div>
              )}

              {/* Item Name */}
              <div className="hig-field-group">
                <label htmlFor="add-garment-name-input" className="hig-field-label">
                  {tx(lang, '아이템명', 'Item Name')}
                </label>
                <input
                  id="add-garment-name-input"
                  type="text"
                  className="hig-native-input"
                  placeholder={tx(
                    lang,
                    '예: 차콜 와이드 코듀로이 밴딩 팬츠',
                    'e.g. Charcoal Wide Corduroy Elastic Pants'
                  )}
                  value={name}
                  onChange={(e) => {
                    markDirty('name');
                    setName(e.target.value);
                  }}
                  maxLength={120}
                  required
                />
              </div>

              {/* Color Swatches + Custom Color */}
              <div className="hig-field-group">
                <div className="hig-field-label-row">
                  <label className="hig-field-label">{tx(lang, '색상', 'Color')}</label>
                  <label className="hig-color-picker-trigger">
                    <span
                      className="hig-detail-color-dot"
                      style={{ backgroundColor: colorHex }}
                    />
                    <span className="tabular-nums">{colorName || colorHex}</span>
                    <input
                      type="color"
                      value={colorHex}
                      aria-label={tx(lang, '직접 색상 선택', 'Pick custom color')}
                      onChange={(e) => {
                        markDirty('color');
                        setColorHex(e.target.value.toUpperCase());
                      }}
                    />
                  </label>
                </div>
                <div className="hig-color-swatch-grid">
                  {GARMENT_COLOR_SWATCHES.map((sw) => {
                    const active = colorName === sw.nameKo || colorHex.toUpperCase() === sw.hex;
                    return (
                      <button
                        key={sw.nameKo}
                        type="button"
                        className={`hig-color-swatch-btn ${active ? 'active' : ''}`}
                        onClick={() => {
                          markDirty('color');
                          setColorName(sw.nameKo);
                          setColorHex(sw.hex);
                        }}
                      >
                        <span
                          className="hig-swatch-circle"
                          style={{ backgroundColor: sw.hex }}
                        />
                        <span>{tx(lang, sw.nameKo, sw.nameEn)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Material */}
              <div className="hig-field-group">
                <label className="hig-field-label">{tx(lang, '재질 · 소재', 'Material')}</label>
                <div className="hig-pill-row" data-add-material-group="true">
                  {GARMENT_MATERIAL_OPTIONS.filter((m) =>
                    category === 'jewelry'
                      ? true
                      : !['18K Yellow Gold', '925 Sterling Silver', 'Sculptural Bronze', 'Platinum & Pearl'].includes(m.key)
                  ).map((mat) => {
                    const selected = material === mat.key;
                    return (
                      <button
                        key={mat.key}
                        type="button"
                        data-add-material-btn={mat.key}
                        aria-pressed={selected}
                        className={`hig-filter-pill ${selected ? 'active' : ''}`}
                        onClick={() => {
                          markDirty('material');
                          setMaterial(mat.key);
                        }}
                      >
                        {tx(lang, mat.ko, mat.en)}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Texture Feel */}
              <div className="hig-field-group">
                <label className="hig-field-label">{tx(lang, '촉감 · 질감', 'Texture Feel')}</label>
                <div className="hig-pill-row">
                  {TEXTURE_FEEL_OPTIONS.map((tOpt) => (
                    <button
                      key={tOpt.key}
                      type="button"
                      aria-pressed={textureFeel === tOpt.key}
                      className={`hig-filter-pill ${textureFeel === tOpt.key ? 'active' : ''}`}
                      onClick={() => {
                        markDirty('textureFeel');
                        setTextureFeel(tOpt.key);
                      }}
                    >
                      {tx(lang, tOpt.ko, tOpt.en)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Fit */}
              <div className="hig-field-group">
                <label className="hig-field-label">{tx(lang, '핏 실루엣', 'Fit')}</label>
                <div className="hig-pill-row">
                  {FIT_OPTIONS.map((fOpt) => (
                    <button
                      key={fOpt.key}
                      type="button"
                      aria-pressed={fit === fOpt.key}
                      className={`hig-filter-pill ${fit === fOpt.key ? 'active' : ''}`}
                      onClick={() => {
                        markDirty('fit');
                        setFit(fOpt.key);
                      }}
                    >
                      {tx(lang, fOpt.ko, fOpt.en)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* -------------------- STEP 2: WEARING DETAILS, SEASONS, MOOD, FIT NOTE -------------------- */}
          {step === 2 && (
            <div className="hig-step-panel">
              {/* Category-specific Wearing Details */}
              {category === 'bottom' && (
                <>
                  <div className="hig-field-group">
                    <label className="hig-field-label">
                      {tx(lang, '허리 방식 · 벨트 착용 가능 여부', 'Waistband & Belt Compatibility')}
                    </label>
                    <div className="hig-pill-row">
                      {WAIST_TYPE_OPTIONS.map((opt) => (
                        <button
                          key={opt.key}
                          type="button"
                          className={`hig-filter-pill ${garmentDetails.waist_type === opt.key ? 'active' : ''}`}
                          onClick={() => updateDetailField('waist_type', opt.key)}
                        >
                          {tx(lang, opt.ko, opt.en)}
                        </button>
                      ))}
                    </div>
                    <div className="hig-grid-2" style={{ marginTop: 8 }}>
                      <button
                        type="button"
                        className={`hig-filter-pill ${garmentDetails.belt_compatible === false ? 'active' : ''}`}
                        onClick={() => updateDetailField('belt_compatible', false)}
                      >
                        {tx(lang, '벨트 불가 (밴딩/루프 없음)', 'No Belt')}
                      </button>
                      <button
                        type="button"
                        className={`hig-filter-pill ${garmentDetails.belt_compatible !== false ? 'active' : ''}`}
                        onClick={() => updateDetailField('belt_compatible', true)}
                      >
                        {tx(lang, '벨트 착용 가능', 'Belt Compatible')}
                      </button>
                    </div>
                  </div>

                  <div className="hig-field-group">
                    <label className="hig-field-label">{tx(lang, '밑위', 'Rise')}</label>
                    <div className="hig-pill-row">
                      {RISE_OPTIONS.map((opt) => (
                        <button
                          key={opt.key}
                          type="button"
                          className={`hig-filter-pill ${garmentDetails.rise === opt.key ? 'active' : ''}`}
                          onClick={() => updateDetailField('rise', opt.key)}
                        >
                          {tx(lang, opt.ko, opt.en)}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="hig-field-group">
                    <label className="hig-field-label">{tx(lang, '기장감', 'Hem Length')}</label>
                    <div className="hig-pill-row">
                      {BOTTOM_LENGTH_OPTIONS.map((opt) => (
                        <button
                          key={opt.key}
                          type="button"
                          className={`hig-filter-pill ${garmentDetails.length_profile === opt.key ? 'active' : ''}`}
                          onClick={() => updateDetailField('length_profile', opt.key)}
                        >
                          {tx(lang, opt.ko, opt.en)}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {category === 'top' && (
                <>
                  <div className="hig-field-group">
                    <label className="hig-field-label">{tx(lang, '네크라인', 'Neckline')}</label>
                    <div className="hig-pill-row">
                      {TOP_NECKLINE_OPTIONS.map((opt) => (
                        <button
                          key={opt.key}
                          type="button"
                          className={`hig-filter-pill ${garmentDetails.neckline === opt.key ? 'active' : ''}`}
                          onClick={() => updateDetailField('neckline', opt.key)}
                        >
                          {tx(lang, opt.ko, opt.en)}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="hig-field-group">
                    <label className="hig-field-label">{tx(lang, '소매 기장', 'Sleeve Length')}</label>
                    <div className="hig-pill-row">
                      {SLEEVE_LENGTH_OPTIONS.map((opt) => (
                        <button
                          key={opt.key}
                          type="button"
                          className={`hig-filter-pill ${garmentDetails.sleeve_length === opt.key ? 'active' : ''}`}
                          onClick={() => updateDetailField('sleeve_length', opt.key)}
                        >
                          {tx(lang, opt.ko, opt.en)}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {category === 'outer' && (
                <>
                  <div className="hig-field-group">
                    <label className="hig-field-label">{tx(lang, '아우터 총장', 'Coat Length')}</label>
                    <div className="hig-pill-row">
                      {OUTER_LENGTH_OPTIONS.map((opt) => (
                        <button
                          key={opt.key}
                          type="button"
                          className={`hig-filter-pill ${garmentDetails.coat_length === opt.key ? 'active' : ''}`}
                          onClick={() => updateDetailField('coat_length', opt.key)}
                        >
                          {tx(lang, opt.ko, opt.en)}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="hig-field-group">
                    <label className="hig-field-label">{tx(lang, '여밈 · 발수', 'Closure & Weather')}</label>
                    <div className="hig-pill-row">
                      {OUTER_CLOSURE_OPTIONS.map((opt) => (
                        <button
                          key={opt.key}
                          type="button"
                          className={`hig-filter-pill ${garmentDetails.closure_type === opt.key ? 'active' : ''}`}
                          onClick={() => updateDetailField('closure_type', opt.key)}
                        >
                          {tx(lang, opt.ko, opt.en)}
                        </button>
                      ))}
                      <button
                        type="button"
                        className={`hig-filter-pill ${waterResistant ? 'active' : ''}`}
                        onClick={() => {
                          markDirty('waterResistant');
                          setWaterResistant((v) => !v);
                        }}
                      >
                        {tx(lang, '생활 방수 · 발수', 'Water Resistant')}
                      </button>
                    </div>
                  </div>
                </>
              )}

              {category === 'shoes' && (
                <div className="hig-field-group">
                  <label className="hig-field-label">{tx(lang, '굽 높이', 'Heel Height')}</label>
                  <div className="hig-pill-row">
                    {SHOE_HEEL_OPTIONS.map((opt) => (
                      <button
                        key={opt.key}
                        type="button"
                        className={`hig-filter-pill ${garmentDetails.heel_height === opt.key ? 'active' : ''}`}
                        onClick={() => updateDetailField('heel_height', opt.key)}
                      >
                        {tx(lang, opt.ko, opt.en)}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Seasons & Thickness */}
              <div className="hig-field-group">
                <label className="hig-field-label">
                  {tx(lang, '계절감 (날씨 코디 추천 연동)', 'Seasons (Weather Sync)')}
                </label>
                <div className="hig-pill-row">
                  {SEASON_OPTIONS.map((sOpt) => (
                    <button
                      key={sOpt.key}
                      type="button"
                      aria-pressed={seasons.includes(sOpt.key)}
                      className={`hig-filter-pill ${seasons.includes(sOpt.key) ? 'active' : ''}`}
                      onClick={() => handleToggleSeason(sOpt.key)}
                    >
                      {tx(lang, sOpt.ko, sOpt.en)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="hig-field-group">
                <label className="hig-field-label">{tx(lang, '두께감', 'Thickness')}</label>
                <div className="hig-pill-row">
                  {THICKNESS_OPTIONS.map((thOpt) => (
                    <button
                      key={thOpt.key}
                      type="button"
                      aria-pressed={thickness === thOpt.key}
                      className={`hig-filter-pill ${thickness === thOpt.key ? 'active' : ''}`}
                      onClick={() => {
                        markDirty('thickness');
                        setThickness(thOpt.key);
                      }}
                    >
                      {tx(lang, thOpt.ko, thOpt.en)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Style Mood & Formality */}
              <div className="hig-field-group">
                <label className="hig-field-label">{tx(lang, '스타일 무드 · 격식도', 'Style Mood')}</label>
                <div className="hig-pill-row">
                  {STYLE_MOOD_OPTIONS.map((mOpt) => (
                    <button
                      key={mOpt.key}
                      type="button"
                      aria-pressed={styleMood === mOpt.key}
                      className={`hig-filter-pill ${styleMood === mOpt.key ? 'active' : ''}`}
                      onClick={() => {
                        markDirty('styleMood');
                        setStyleMood(mOpt.key);
                        setFormality(mOpt.formality);
                      }}
                    >
                      {tx(lang, mOpt.ko, mOpt.en)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Personal Fit Note (injected into VTON & styling) */}
              <div className="hig-field-group">
                <label htmlFor="add-garment-fit-note" className="hig-field-label">
                  {tx(
                    lang,
                    '개인 피팅 메모 (가상 피팅 · 코디에 반영)',
                    'Personal Fit Note (Used in Virtual Try-On)'
                  )}
                </label>
                <textarea
                  id="add-garment-fit-note"
                  className="hig-native-textarea"
                  rows={2}
                  placeholder={tx(
                    lang,
                    '예: 올려 입으면 복숭아뼈에 오고 내려 입으면 끌려요',
                    'e.g. Hits ankle bone when worn high, drags if worn low'
                  )}
                  value={fitNote}
                  onChange={(e) => {
                    markDirty('fitNote');
                    setFitNote(e.target.value);
                  }}
                  maxLength={300}
                />
                <div className="hig-quick-note-chips">
                  {quickFitNotes.map((chip) => {
                    const text = tx(lang, chip.ko, chip.en);
                    return (
                      <button
                        key={chip.ko}
                        type="button"
                        className="hig-mini-chip"
                        onClick={() => {
                          markDirty('fitNote');
                          setFitNote((prev) => (prev.trim() ? `${prev.trim()} · ${text}` : text));
                        }}
                      >
                        + {text}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* -------------------- STEP 3: OPTIONAL PURCHASE & CARE INFO -------------------- */}
          {step === 3 && (
            <div className="hig-step-panel">
              <div className="hig-field-grid-2">
                <div className="hig-field-group">
                  <label htmlFor="add-garment-brand-input" className="hig-field-label">
                    {tx(lang, '브랜드 (선택)', 'Brand (Optional)')}
                  </label>
                  <input
                    id="add-garment-brand-input"
                    type="text"
                    className="hig-native-input"
                    placeholder="Lemaire / COS / Uniqlo"
                    value={brand}
                    onChange={(e) => {
                      markDirty('brand');
                      setBrand(e.target.value);
                    }}
                    maxLength={80}
                  />
                </div>

                <div className="hig-field-group">
                  <label htmlFor="add-garment-code-input" className="hig-field-label">
                    {tx(lang, '품번 · 스타일 코드', 'Product Code')}
                  </label>
                  <input
                    id="add-garment-code-input"
                    type="text"
                    className="hig-native-input tabular-nums"
                    placeholder={tx(lang, '세탁탭 품번', 'Tag SKU / Code')}
                    value={productCode}
                    onChange={(e) => {
                      markDirty('productCode');
                      setProductCode(e.target.value);
                    }}
                    maxLength={64}
                  />
                </div>
              </div>

              {(brand.trim() || productCode.trim() || tagPreviews.length > 0) &&
                webLookupStatus !== 'searching' && (
                  <button
                    type="button"
                    className="hig-web-manual-search-btn"
                    onClick={() =>
                      triggerWebLookup(
                        {
                          brand: brand.trim(),
                          product_code: productCode.trim(),
                          name: name.trim(),
                          category,
                          color_name: colorName,
                          material,
                        },
                        { openModalOnMatch: true }
                      )
                    }
                  >
                    <Globe size={14} />
                    <span>
                      {tx(
                        lang,
                        '공식 브랜드 DB에서 제품 정보 찾아 동기화하기',
                        'Search Official Brand DB & Open Sync Modal'
                      )}
                    </span>
                  </button>
                )}

              <div className="hig-field-grid-2">
                <div className="hig-field-group">
                  <label htmlFor="add-garment-price-input" className="hig-field-label">
                    {tx(lang, '가격 (원 · 선택)', 'Price (KRW · Optional)')}
                  </label>
                  <input
                    id="add-garment-price-input"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step={1000}
                    className="hig-native-input tabular-nums"
                    placeholder="89000"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                  />
                </div>

                <div className="hig-field-group">
                  <label htmlFor="add-garment-date-input" className="hig-field-label">
                    {tx(lang, '구매시기 (선택)', 'Purchase Month')}
                  </label>
                  <input
                    id="add-garment-date-input"
                    type="month"
                    className="hig-native-input tabular-nums"
                    value={purchaseDate}
                    onChange={(e) => setPurchaseDate(e.target.value)}
                  />
                </div>
              </div>

              <div className="hig-field-grid-2">
                <div className="hig-field-group">
                  <label htmlFor="add-garment-store-input" className="hig-field-label">
                    {tx(lang, '구매처 (선택)', 'Store / Platform')}
                  </label>
                  <input
                    id="add-garment-store-input"
                    type="text"
                    className="hig-native-input"
                    placeholder={tx(lang, '예: 29CM, 성수 매장', 'e.g. SSENSE, Flagship')}
                    value={purchaseStore}
                    onChange={(e) => setPurchaseStore(e.target.value)}
                    maxLength={80}
                  />
                </div>

                <div className="hig-field-group">
                  <label htmlFor="add-garment-size-input" className="hig-field-label">
                    {tx(lang, '사이즈 태그', 'Size Tag')}
                  </label>
                  <input
                    id="add-garment-size-input"
                    type="text"
                    className="hig-native-input tabular-nums"
                    placeholder="M / 30 / 100"
                    value={size}
                    onChange={(e) => {
                      markDirty('size');
                      setSize(e.target.value);
                    }}
                    maxLength={32}
                  />
                </div>
              </div>

              <div className="hig-quick-size-chips">
                {QUICK_SIZES.map((sz) => (
                  <button
                    key={sz}
                    type="button"
                    className={`hig-mini-chip ${size === sz ? 'active' : ''}`}
                    onClick={() => {
                      markDirty('size');
                      setSize(sz);
                    }}
                  >
                    {sz}
                  </button>
                ))}
              </div>

              <div className="hig-field-group">
                <label htmlFor="add-garment-comp-input" className="hig-field-label">
                  {tx(lang, '소재 혼용률 (세탁탭)', 'Fiber Composition')}
                </label>
                <input
                  id="add-garment-comp-input"
                  type="text"
                  className="hig-native-input"
                  placeholder={tx(lang, '예: 면 98%, 폴리우레탄 2%', 'e.g. 98% Cotton, 2% Elastane')}
                  value={materialComposition}
                  onChange={(e) => {
                    markDirty('materialComposition');
                    setMaterialComposition(e.target.value);
                  }}
                  maxLength={140}
                />
              </div>

              <div className="hig-field-group">
                <label htmlFor="add-garment-care-input" className="hig-field-label">
                  {tx(lang, '세탁 · 관리 팁', 'Care & Washing Tip')}
                </label>
                <input
                  id="add-garment-care-input"
                  type="text"
                  className="hig-native-input"
                  placeholder={tx(
                    lang,
                    '예: 뒤집어 찬물 단독 세탁, 건조기 사용 금지',
                    'e.g. Cold gentle wash inside out, line dry'
                  )}
                  value={careTip}
                  onChange={(e) => {
                    markDirty('careTip');
                    setCareTip(e.target.value);
                  }}
                  maxLength={240}
                />
              </div>

              {/* Structured Smart Laundry Care Profile */}
              <div
                className="rounded-xl border border-black/10 dark:border-white/12 bg-black/[0.02] dark:bg-white/[0.03] p-3.5 space-y-3"
                data-add-garment-care-profile="true"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[12px] font-semibold text-neutral-900 dark:text-white">
                      {tx(lang, '세탁 기준 자동 구조화', 'Structured Laundry Care')}
                    </div>
                    <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5 leading-snug">
                      {formatCareSummaryTokens(effectiveCareProfile, lang).join(' · ')}
                    </p>
                  </div>
                  {careLabelPreview && (
                    <img
                      src={careLabelPreview}
                      alt={tx(lang, '세탁탭 보관 이미지', 'Archived care label')}
                      className="w-10 h-10 rounded-lg object-cover border border-black/10 dark:border-white/15 shrink-0"
                    />
                  )}
                </div>

                <div>
                  <span className="block text-[11px] font-medium text-neutral-500 dark:text-neutral-400 mb-1.5">
                    {tx(lang, '세탁 방식', 'Wash Method')}
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                    {[
                      { key: 'dry_clean_only', ko: '드라이 전용', en: 'Dry Clean' },
                      { key: 'wool_delicate', ko: '울·니트 코스', en: 'Wool / Delicate' },
                      { key: 'hand_wash', ko: '손세탁', en: 'Hand Wash' },
                      { key: 'machine_normal', ko: '일반 세탁', en: 'Normal Wash' },
                      { key: 'spot_clean', ko: '부분 케어', en: 'Spot Clean' },
                    ].map((opt) => {
                      const active = effectiveCareProfile.washMethod === opt.key;
                      return (
                        <button
                          key={opt.key}
                          type="button"
                          onClick={() => {
                            markDirty('careProfile');
                            triggerHaptic('selection');
                            setCareProfileOverride({
                              ...effectiveCareProfile,
                              washMethod: opt.key,
                              waterTempC:
                                opt.key === 'dry_clean_only' || opt.key === 'spot_clean'
                                  ? 0
                                  : opt.key === 'wool_delicate' || opt.key === 'hand_wash'
                                    ? 30
                                    : effectiveCareProfile.waterTempC || 40,
                              tumbleDry:
                                opt.key === 'dry_clean_only' ||
                                opt.key === 'wool_delicate' ||
                                opt.key === 'hand_wash'
                                  ? 'no_tumble_flat'
                                  : effectiveCareProfile.tumbleDry,
                              source: 'user_edited',
                            });
                          }}
                          className={`min-h-[38px] px-2.5 rounded-lg text-[11px] font-medium border transition-colors ${
                            active
                              ? 'bg-neutral-900 text-white border-neutral-900 dark:bg-white dark:text-neutral-950 dark:border-white'
                              : 'bg-white dark:bg-neutral-900 text-neutral-700 dark:text-neutral-300 border-black/10 dark:border-white/12'
                          }`}
                        >
                          {tx(lang, opt.ko, opt.en)}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      markDirty('careProfile');
                      triggerHaptic('selection');
                      const isNoTumble =
                        effectiveCareProfile.tumbleDry === 'no_tumble_flat' ||
                        effectiveCareProfile.tumbleDry === 'no_tumble_hang';
                      setCareProfileOverride({
                        ...effectiveCareProfile,
                        tumbleDry: isNoTumble ? 'low_heat' : 'no_tumble_flat',
                        source: 'user_edited',
                      });
                    }}
                    className={`min-h-[36px] px-3 rounded-lg text-[11px] font-medium border transition-colors ${
                      effectiveCareProfile.tumbleDry === 'no_tumble_flat' ||
                      effectiveCareProfile.tumbleDry === 'no_tumble_hang'
                        ? 'bg-neutral-900 text-white border-neutral-900 dark:bg-white dark:text-neutral-950 dark:border-white'
                        : 'bg-white dark:bg-neutral-900 text-neutral-700 dark:text-neutral-300 border-black/10 dark:border-white/12'
                    }`}
                  >
                    {effectiveCareProfile.tumbleDry === 'no_tumble_flat' ||
                    effectiveCareProfile.tumbleDry === 'no_tumble_hang'
                      ? tx(lang, '건조기 금지 ON', 'No Tumble Dry ON')
                      : tx(lang, '건조기 가능', 'Tumble Dry OK')}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      markDirty('careProfile');
                      triggerHaptic('selection');
                      setCareProfileOverride({
                        ...effectiveCareProfile,
                        needsLaundryNet: !effectiveCareProfile.needsLaundryNet,
                        source: 'user_edited',
                      });
                    }}
                    className={`min-h-[36px] px-3 rounded-lg text-[11px] font-medium border transition-colors ${
                      effectiveCareProfile.needsLaundryNet
                        ? 'bg-neutral-900 text-white border-neutral-900 dark:bg-white dark:text-neutral-950 dark:border-white'
                        : 'bg-white dark:bg-neutral-900 text-neutral-700 dark:text-neutral-300 border-black/10 dark:border-white/12'
                    }`}
                  >
                    {effectiveCareProfile.needsLaundryNet
                      ? tx(lang, '세탁망 권장 ON', 'Mesh Bag ON')
                      : tx(lang, '세탁망 불필요', 'No Mesh Bag')}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      markDirty('careProfile');
                      triggerHaptic('selection');
                      setCareProfileOverride({
                        ...effectiveCareProfile,
                        colorBleedRisk:
                          effectiveCareProfile.colorBleedRisk === 'high' ? 'low' : 'high',
                        source: 'user_edited',
                      });
                    }}
                    className={`min-h-[36px] px-3 rounded-lg text-[11px] font-medium border transition-colors ${
                      effectiveCareProfile.colorBleedRisk === 'high'
                        ? 'bg-neutral-900 text-white border-neutral-900 dark:bg-white dark:text-neutral-950 dark:border-white'
                        : 'bg-white dark:bg-neutral-900 text-neutral-700 dark:text-neutral-300 border-black/10 dark:border-white/12'
                    }`}
                  >
                    {effectiveCareProfile.colorBleedRisk === 'high'
                      ? tx(lang, '이염 주의 ON', 'Color Bleed Risk ON')
                      : tx(lang, '이염 위험 낮음', 'Low Bleed Risk')}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Sticky Thumb-Zone Footer */}
          <div className="hig-guided-footer">
            <button
              type="button"
              className="hig-guided-back-btn"
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              disabled={submitting}
            >
              <ArrowLeft size={16} />
              <span>{step === 1 ? tx(lang, '사진', 'Photos') : tx(lang, '이전', 'Back')}</span>
            </button>

            {step < 3 ? (
              <div className="hig-guided-footer-right">
                <button
                  type="submit"
                  className="hig-guided-quicksave-btn"
                  disabled={submitting || !stepperState.canSave}
                >
                  {tx(lang, '바로 저장', 'Quick Save')}
                </button>
                <button
                  type="button"
                  className="hig-primary-cta-btn hig-guided-next-btn"
                  onClick={() => {
                    triggerHaptic('selection');
                    setStep((s) => Math.min(3, s + 1));
                  }}
                >
                  <span>{tx(lang, '다음 단계', 'Next')}</span>
                  <ArrowRight size={16} />
                </button>
              </div>
            ) : (
              <button
                id={CARBON_DOM_CONTRACT.wardrobeSubmitAddBtnId}
                type="submit"
                className="hig-primary-cta-btn hig-guided-next-btn"
                disabled={submitting || !stepperState.canSave}
              >
                <Check size={17} />
                <span>
                  {submitting
                    ? tx(lang, '옷장에 저장 중...', 'Saving...')
                    : tx(lang, '옷장에 추가', 'Add to Wardrobe')}
                </span>
              </button>
            )}
          </div>
        </>
      )}

      {/* Official Brand DB Info Sync Modal */}
      <OfficialInfoSyncModal
        open={syncModalOpen}
        lang={lang}
        webMatch={webMatch}
        currentValues={currentSyncValues}
        currentFrontImage={frontCutout?.cutoutDataUrl || frontPreview}
        officialImageCutout={officialImageCutout}
        onClose={() => setSyncModalOpen(false)}
        onConfirmSync={handleConfirmSyncModal}
        onRunStudioInstead={frontPreview ? () => handleRunStudioRefinement('front') : null}
      />
    </form>
  );
}

export default function AddGarmentModal({
  open,
  activeCloset,
  lang = 'ko',
  onClose,
  onRegistered,
  showToast,
}) {
  return (
    <ResponsiveSheetModal
      open={open}
      onClose={onClose}
      lang={lang}
      title={tx(lang, '옷 등록 가이드', 'Guided Add Item')}
      maxWidth={540}
    >
      {open && (
        <AddGarmentForm
          activeCloset={activeCloset}
          lang={lang}
          onClose={onClose}
          onRegistered={onRegistered}
          showToast={showToast}
        />
      )}
    </ResponsiveSheetModal>
  );
}
