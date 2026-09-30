import React, { useState, useRef, useEffect } from 'react';
import {
  StyleSheet, Text, View, TouchableOpacity, ScrollView, Image,
  TextInput, Modal, ActivityIndicator, Alert, StatusBar,
  Dimensions, Animated, Platform, KeyboardAvoidingView, Linking,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import DraggableFlatList, { ScaleDecorator } from 'react-native-draggable-flatlist';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import JSZip from 'jszip';

const { width: SW, height: SH } = Dimensions.get('window');

const C = {
  bg: '#050816', cyan: '#00d4ff', cyan2: '#06ffe4',
  purple: '#a855f7', purple2: '#8b5cf6', pink: '#ec4899',
  green: '#10b981', red: '#ef4444', amber: '#fbbf24',
  text: '#f8fafc', muted: '#94a3b8', muted2: '#64748b',
  glass: 'rgba(15,23,42,0.6)', stroke: 'rgba(0,212,255,0.2)',
};

/* ============================================================
   مكون البطاقة القابلة للسحب
   ============================================================ */
function DraggableImageCard({ item, index, total, onDelete, onRotate, drag, isActive }) {
  return (
    <ScaleDecorator>
      <TouchableOpacity
        onLongPress={drag}
        disabled={isActive}
        activeOpacity={0.9}
        style={[s.dragCard, isActive && s.dragCardActive]}>
        <View style={s.dragThumb}>
          <Image
            source={{ uri: item.uri }}
            style={[s.dragThumbImg, { transform: [{ rotate: (item.rotation || 0) + 'deg' }] }]}
            resizeMode="cover"
          />
          <View style={s.dragIndexBadge}>
            <Text style={s.dragIndexText}>صفحة {index + 1}</Text>
          </View>
          <View style={s.dragHandle}>
            <Text style={s.dragHandleIcon}>☰</Text>
          </View>
        </View>

        <View style={s.dragInfo}>
          <Text style={s.dragFileName} numberOfLines={1}>
            صورة #{index + 1}
          </Text>
          <View style={s.dragActions}>
            <TouchableOpacity style={s.dragBtn} onPress={() => onRotate(item.id)}>
              <Text style={s.dragBtnIcon}>🔄</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.dragBtn, s.dragBtnRed]} onPress={() => onDelete(item.id)}>
              <Text style={s.dragBtnIcon}>🗑️</Text>
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    </ScaleDecorator>
  );
}

/* ============================================================
   التطبيق الرئيسي
   ============================================================ */
export default function App() {
  const [images, setImages] = useState([]);
  const [pdfDocs, setPdfDocs] = useState([]);
  const [fileName, setFileName] = useState('ملف_الصور_المحول');
  const [quality, setQuality] = useState('عالية');
  const [pageSize, setPageSize] = useState('A4');
  const [orientation, setOrientation] = useState('auto');
  const [isGenerating, setIsGenerating] = useState(false);

  // AI
  const [geminiKey, setGeminiKey] = useState('');
  const [showAiSettings, setShowAiSettings] = useState(false);
  const [aiKeyInput, setAiKeyInput] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiResult, setAiResult] = useState(null);
  const [showAiResult, setShowAiResult] = useState(false);

  // Share Modal
  const [showShare, setShowShare] = useState(false);
  const [resultUri, setResultUri] = useState(null);
  const [resultName, setResultName] = useState('');
  const [resultSize, setResultSize] = useState(0);

  // Animations
  const fadeIn = useRef(new Animated.Value(0)).current;
  const slideUp = useRef(new Animated.Value(30)).current;
  const pulse1 = useRef(new Animated.Value(1)).current;
  const pulse2 = useRef(new Animated.Value(1)).current;
  const heroFloat = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeIn, { toValue: 1, duration: 800, useNativeDriver: true }),
      Animated.timing(slideUp, { toValue: 0, duration: 800, useNativeDriver: true }),
    ]).start();
    Animated.loop(Animated.sequence([
      Animated.timing(pulse1, { toValue: 1.12, duration: 1500, useNativeDriver: true }),
      Animated.timing(pulse1, { toValue: 1, duration: 1500, useNativeDriver: true }),
    ])).start();
    Animated.loop(Animated.sequence([
      Animated.timing(pulse2, { toValue: 1.08, duration: 2000, useNativeDriver: true }),
      Animated.timing(pulse2, { toValue: 1, duration: 2000, useNativeDriver: true }),
    ])).start();
    Animated.loop(Animated.sequence([
      Animated.timing(heroFloat, { toValue: -12, duration: 2500, useNativeDriver: true }),
      Animated.timing(heroFloat, { toValue: 0, duration: 2500, useNativeDriver: true }),
    ])).start();
  }, []);

  const ensureBase64 = async (uri, existing) => {
    if (existing && existing.length > 100) return existing;
    try {
      return await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
    } catch (e) { return null; }
  };

  /* ============ فتح الاستوديو ============ */
  const openGallery = async () => {
    try {
      let p = await ImagePicker.getMediaLibraryPermissionsAsync();
      if (!p.granted) {
        p = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!p.granted) { Alert.alert('مرفوض', 'نحتاج إذن الوصول للصور.'); return; }
      }
      const r = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        quality: quality === 'عالية' ? 1 : 0.75,
        base64: true,
        selectionLimit: 30,
      });
      if (!r.canceled && r.assets) {
        const newImgs = [];
        for (let i = 0; i < r.assets.length; i++) {
          const a = r.assets[i];
          const b64 = await ensureBase64(a.uri, a.base64);
          if (b64) newImgs.push({
            id: 'img_' + Date.now() + '_' + i, uri: a.uri, base64: b64,
            mime: a.mimeType || 'image/jpeg', rotation: 0,
          });
        }
        setImages(prev => [...prev, ...newImgs]);
      }
    } catch (err) { Alert.alert('خطأ', err.message); }
  };

  /* ============ الكاميرا ============ */
  const openCamera = async () => {
    try {
      let p = await ImagePicker.getCameraPermissionsAsync();
      if (!p.granted) {
        p = await ImagePicker.requestCameraPermissionsAsync();
        if (!p.granted) { Alert.alert('مرفوض', 'نحتاج إذن الكاميرا.'); return; }
      }
      const r = await ImagePicker.launchCameraAsync({
        quality: quality === 'عالية' ? 1 : 0.75, base64: true,
      });
      if (!r.canceled && r.assets && r.assets[0]) {
        const a = r.assets[0];
        const b64 = await ensureBase64(a.uri, a.base64);
        if (b64) setImages(prev => [...prev, {
          id: 'img_' + Date.now(), uri: a.uri, base64: b64,
          mime: a.mimeType || 'image/jpeg', rotation: 0,
        }]);
      }
    } catch (err) { Alert.alert('خطأ', err.message); }
  };

  /* ============ رفع PDF ============ */
  const pickPdf = async () => {
    try {
      const r = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        multiple: true,
        copyToCacheDirectory: true,
      });
      if (r.canceled) return;
      const newDocs = [];
      for (const asset of r.assets) {
        try {
          const b64 = await FileSystem.readAsStringAsync(asset.uri, {
            encoding: FileSystem.EncodingType.Base64,
          });
          newDocs.push({
            id: 'pdf_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
            name: asset.name || 'document.pdf',
            uri: asset.uri,
            base64: b64,
            status: 'waiting',
            aiData: null,
            newName: (asset.name || 'document').replace(/\.pdf$/i, '') + '_مُسمى.pdf',
          });
        } catch (e) {
          console.warn('فشل قراءة PDF:', e.message);
        }
      }
      if (newDocs.length) {
        setPdfDocs(prev => [...prev, ...newDocs]);
        if (geminiKey) {
          setTimeout(() => scanAllPdfs([...pdfDocs, ...newDocs]), 500);
        }
      }
    } catch (err) { Alert.alert('خطأ', err.message); }
  };

  const removePdf = (id) => setPdfDocs(prev => prev.filter(d => d.id !== id));
  const removeImage = (id) => setImages(prev => prev.filter(i => i.id !== id));
  const rotateImage = (id) => setImages(prev => prev.map(i =>
    i.id === id ? { ...i, rotation: ((i.rotation || 0) + 90) % 360 } : i));

  const clearAll = () => {
    if (!images.length && !pdfDocs.length) return;
    Alert.alert('تأكيد', 'حذف جميع الملفات؟', [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'حذف', style: 'destructive', onPress: () => {
        setImages([]); setPdfDocs([]); setAiResult(null);
      }},
    ]);
  };

  /* ============ AI: حفظ المفتاح ============ */
  const saveAiKey = () => {
    const k = aiKeyInput.trim();
    if (k.length < 10) { Alert.alert('تنبيه', 'المفتاح قصير جداً'); return; }
    setGeminiKey(k);
    setShowAiSettings(false);
    Alert.alert('✓', 'تم حفظ المفتاح');
  };

  /* ============ AI: تحليل الصور ============ */
  const analyzeImages = async () => {
    if (!geminiKey || geminiKey.length < 10) {
      setAiKeyInput(geminiKey); setShowAiSettings(true); return;
    }
    if (!images.length) { Alert.alert('تنبيه', 'أضف صوراً أولاً.'); return; }
    setIsAnalyzing(true);
    try {
      const parts = [{
        text: `أنت محلل مستندات خبير. هذه ${images.length} صورة سيتم دمجها في PDF.
اقرأ كل صورة واكتشف نوع الوثيقة، ثم أعد JSON فقط:
{
  "documents": [{"type":"نوع","details":"تفاصيل"}],
  "personName":"الاسم أو غير محدد",
  "country":"الدولة أو غير محدد",
  "summary":"وصف في 20 كلمة",
  "fileName":"اسم مقترح للملف بالعربية"
}`,
      }];
      for (const img of images) {
        if (img.base64) {
          parts.push({ inline_data: { mime_type: img.mime || 'image/jpeg', data: img.base64 } });
        }
      }
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${geminiKey}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: {
            temperature: 0.15, maxOutputTokens: 2000,
            responseMimeType: 'application/json',
          },
          safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
          ],
        }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        const m = e.error?.message || `HTTP ${res.status}`;
        throw new Error(m.includes('API_KEY') ? 'المفتاح غير صحيح' : m);
      }
      const data = await res.json();
      let text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      text = text.replace(/```json/gi, '').replace(/```/g, '').trim();
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('استجابة غير صالحة');
      const parsed = JSON.parse(match[0]);
      setAiResult(parsed);
      if (parsed.fileName) setFileName(parsed.fileName.replace(/\.pdf$/i, ''));
      setShowAiResult(true);
    } catch (err) {
      Alert.alert('فشل التحليل', err.message);
    } finally { setIsAnalyzing(false); }
  };

  /* ============ AI: فحص PDF واحد ============ */
  const scanSinglePdf = async (doc) => {
    if (!geminiKey || geminiKey.length < 10) return doc;
    setPdfDocs(prev => prev.map(d => d.id === doc.id ? { ...d, status: 'scanning' } : d));
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${geminiKey}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [
            { text: `اقرأ ملف PDF وأعد JSON فقط:
{
  "documentTypes":[{"type":"نوع الوثيقة","details":"تفاصيل"}],
  "personName":"الاسم أو غير محدد",
  "country":"الدولة أو غير محدد",
  "summary":"وصف مختصر 20 كلمة",
  "newFileName":"اسم مقترح بالعربية"
}` },
            { inline_data: { mime_type: 'application/pdf', data: doc.base64 } },
          ]}],
          generationConfig: { temperature: 0.1, maxOutputTokens: 1500, responseMimeType: 'application/json' },
          safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
          ],
        }),
      });
      if (!res.ok) throw new Error('فشل الاتصال');
      const data = await res.json();
      let text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      text = text.replace(/```json/gi, '').replace(/```/g, '').trim();
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('استجابة غير صالحة');
      const parsed = JSON.parse(match[0]);
      const newName = (parsed.newFileName || doc.newName).replace(/\.pdf$/i, '') + '.pdf';
      setPdfDocs(prev => prev.map(d => d.id === doc.id
        ? { ...d, status: 'done', aiData: parsed, newName }
        : d));
    } catch (e) {
      setPdfDocs(prev => prev.map(d => d.id === doc.id
        ? { ...d, status: 'error', aiData: { error: e.message } }
        : d));
    }
    return doc;
  };

  const scanAllPdfs = async (docsList) => {
    const docs = docsList || pdfDocs;
    for (const d of docs) {
      if (d.status !== 'done') {
        await scanSinglePdf(d);
        await new Promise(r => setTimeout(r, 600));
      }
    }
  };

  /* ============ إنشاء PDF ============ */
  const generatePdf = async () => {
    if (!images.length) { Alert.alert('تنبيه', 'أضف صورة على الأقل.'); return; }
    setIsGenerating(true);
    try {
      const pf = pageSize === 'A4' ? 'A4' : 'letter';
      const pages = [];
      for (const img of images) {
        const b64 = await ensureBase64(img.uri, img.base64);
        if (!b64) continue;
        pages.push(`<div class="page"><img src="data:${img.mime || 'image/jpeg'};base64,${b64}" style="transform: rotate(${img.rotation || 0}deg);" /></div>`);
      }
      if (!pages.length) throw new Error('لم يتم قراءة أي صورة');

      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
        <style>
          @page { size: ${pf}; margin: 0; }
          html, body { margin: 0; padding: 0; background: white; }
          .page { width: 100%; height: 100vh; display: flex; justify-content: center;
                  align-items: center; page-break-after: always; overflow: hidden; background: white; }
          .page:last-child { page-break-after: auto; }
          img { max-width: 100%; max-height: 100%; object-fit: contain; }
        </style></head><body>${pages.join('')}</body></html>`;

      const { uri } = await Print.printToFileAsync({ html });

      const safe = (fileName || 'document')
        .replace(/\.pdf$/i, '')
        .replace(/[^a-zA-Z0-9_\u0600-\u06FF\-]/g, '_')
        .substring(0, 60) || 'document';

      const target = `${FileSystem.cacheDirectory}${safe}.pdf`;
      try {
        const old = await FileSystem.getInfoAsync(target);
        if (old.exists) await FileSystem.deleteAsync(target, { idempotent: true });
        await FileSystem.moveAsync({ from: uri, to: target });
      } catch (e) {
        setResultUri(uri); setResultName(safe + '.pdf'); setResultSize(0); setShowShare(true); return;
      }

      let size = 0;
      try { const info = await FileSystem.getInfoAsync(target); size = info.size || 0; } catch (e) {}

      setResultUri(target);
      setResultName(safe + '.pdf');
      setResultSize(size);
      setShowShare(true);
    } catch (err) {
      Alert.alert('خطأ', err.message);
    } finally { setIsGenerating(false); }
  };

  const shareResult = async () => {
    if (!resultUri) return;
    try {
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(resultUri, {
          mimeType: 'application/pdf',
          dialogTitle: resultName,
          UTI: 'com.adobe.pdf',
        });
      } else Alert.alert('تنبيه', 'المشاركة غير متاحة.');
    } catch (e) { Alert.alert('تعذر المشاركة', e.message); }
  };

  const shareWhatsApp = () => {
    const txt = encodeURIComponent(`📄 تم إنشاء ملف PDF: ${resultName}`);
    Linking.openURL(`whatsapp://send?text=${txt}`).catch(() =>
      Alert.alert('تنبيه', 'واتساب غير مثبت'));
  };

  const shareTelegram = () => {
    const txt = encodeURIComponent(`📄 ملف PDF: ${resultName}`);
    Linking.openURL(`tg://msg?text=${txt}`).catch(() =>
      Alert.alert('تنبيه', 'تليجرام غير مثبت'));
  };

  const shareEmail = () => {
    const sub = encodeURIComponent('ملف PDF');
    const body = encodeURIComponent(`الملف: ${resultName}`);
    Linking.openURL(`mailto:?subject=${sub}&body=${body}`);
  };

  /* ============ تحميل ZIP ============ */
  const downloadAllAsZip = async () => {
    if (!pdfDocs.length) { Alert.alert('تنبيه', 'لا توجد ملفات PDF.'); return; }
    try {
      const zip = new JSZip();
      const used = new Set();
      for (const doc of pdfDocs) {
        let n = (doc.newName || doc.name);
        if (!n.toLowerCase().endsWith('.pdf')) n += '.pdf';
        let final = n, c = 1;
        while (used.has(final)) { final = n.replace(/\.pdf$/i, `_${c}.pdf`); c++; }
        used.add(final);
        zip.file(final, doc.base64, { base64: true });
      }
      const blob = await zip.generateAsync({ type: 'base64' });
      const zipPath = `${FileSystem.cacheDirectory}documents_${Date.now()}.zip`;
      await FileSystem.writeAsStringAsync(zipPath, blob, { encoding: FileSystem.EncodingType.Base64 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(zipPath, {
          mimeType: 'application/zip',
          dialogTitle: 'مشاركة جميع المستندات',
        });
      } else {
        Alert.alert('تم', `تم إنشاء ZIP في: ${zipPath}`);
      }
    } catch (e) { Alert.alert('خطأ', e.message); }
  };

  const shareSinglePdf = async (doc) => {
    try {
      const safe = (doc.newName || doc.name).replace(/[^a-zA-Z0-9_\u0600-\u06FF\-.]/g, '_');
      const target = `${FileSystem.cacheDirectory}${safe}`;
      await FileSystem.writeAsStringAsync(target, doc.base64, { encoding: FileSystem.EncodingType.Base64 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(target, { mimeType: 'application/pdf', dialogTitle: safe });
      }
    } catch (e) { Alert.alert('خطأ', e.message); }
  };

  const fmtSize = (b) => {
    if (!b) return '';
    if (b < 1024) return b + ' B';
    if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
    return (b / 1048576).toFixed(2) + ' MB';
  };

  /* ============================================================
     UI
     ============================================================ */
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={s.root}>
        <StatusBar barStyle="light-content" backgroundColor={C.bg} />

        <View style={s.aurora} pointerEvents="none">
          <View style={[s.orb, s.orbCyan]} />
          <View style={[s.orb, s.orbPurple]} />
          <View style={[s.orb, s.orbPink]} />
        </View>

        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

          {/* Header */}
          <Animated.View style={[s.header, { opacity: fadeIn, transform: [{ translateY: slideUp }] }]}>
            <View style={s.logoBox}>
              <LinearGradient colors={[C.cyan, C.purple]} style={s.logoIconWrap}>
                <Text style={s.logoIconText}>📄</Text>
              </LinearGradient>
              <View style={s.logoTextBox}>
                <Text style={s.brandTitle}>Image → PDF</Text>
                <Text style={s.brandSub}>محول المستندات الذكي</Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={() => { setAiKeyInput(geminiKey); setShowAiSettings(true); }}
              style={[s.aiBtn, geminiKey && s.aiBtnActive]}>
              <Text style={{ fontSize: 20 }}>🤖</Text>
            </TouchableOpacity>
          </Animated.View>

          {/* Badge */}
          <Animated.View style={[s.badgeWrap, { opacity: fadeIn }]}>
            <View style={s.badge}>
              <View style={s.badgeDot} />
              <Text style={s.badgeText}>⚡ أداة احترافية سهلة الاستخدام</Text>
            </View>
          </Animated.View>

          {/* Hero */}
          <Animated.View style={[s.heroWrap, { opacity: fadeIn, transform: [{ translateY: heroFloat }] }]}>
            <View style={s.heroCanvas}>
              <Animated.View style={[s.heroCardBack, { transform: [{ rotate: '-12deg' }, { scale: pulse1 }] }]}>
                <Text style={{ fontSize: 28 }}>🖼️</Text>
              </Animated.View>
              <Text style={s.heroArrow}>➜</Text>
              <View style={[s.heroCardFront, { transform: [{ rotate: '8deg' }] }]}>
                <Text style={{ fontSize: 32 }}>📑</Text>
                <Text style={s.heroPdf}>PDF</Text>
              </View>
            </View>
          </Animated.View>

          {/* Title */}
          <Animated.View style={[s.titleWrap, { opacity: fadeIn, transform: [{ translateY: slideUp }] }]}>
            <View style={s.taglineRow}>
              <View style={s.taglineLine} />
              <Text style={s.tagline}>محول PDF الذكي</Text>
            </View>
            <Text style={s.mainTitle}>
              حوّل صورك إلى{'\n'}
              <Text style={s.gradientText}>ملف PDF</Text> احترافي
            </Text>
            <Text style={s.subtitle}>
              أضف صورك، رتّبها بالسحب والإفلات، افحصها بالذكاء الاصطناعي، وحوّلها إلى PDF.
            </Text>
          </Animated.View>

          {/* Features */}
          <View style={s.featuresGrid}>
            {[
              { i: '♾️', t: 'عدد غير محدود', d: 'من الصور بملف واحد' },
              { i: '✋', t: 'سحب وإفلات', d: 'رتّب الصور بسهولة' },
              { i: '🧠', t: 'تحليل ذكي', d: 'يقرأ كل وثيقة' },
              { i: '📄', t: 'رفع PDF', d: 'افحص ملفات PDF' },
            ].map((f, i) => (
              <View key={i} style={s.featBox}>
                <View style={s.featIcon}>
                  <Text style={{ fontSize: 22 }}>{f.i}</Text>
                </View>
                <Text style={s.featTitle}>{f.t}</Text>
                <Text style={s.featDesc}>{f.d}</Text>
              </View>
            ))}
          </View>

          {/* Upload */}
          <TouchableOpacity style={s.uploadCard} onPress={openGallery} activeOpacity={0.85}>
            <View style={s.uploadRippleWrap}>
              <Animated.View style={[s.uploadRipple, { transform: [{ scale: pulse1 }] }]} />
              <View style={s.uploadCircle}>
                <Text style={{ fontSize: 38 }}>☁️</Text>
              </View>
            </View>
            <Text style={s.uploadTitle}>اضغط لإضافة صور</Text>
            <Text style={s.uploadSub}>من استوديو الصور مباشرة</Text>
            <LinearGradient
              colors={['#06b6d4', '#3b82f6', '#a855f7']}
              style={s.uploadBtn}>
              <Text style={s.uploadBtnText}>📂 اختر الصور</Text>
            </LinearGradient>
            <View style={s.privacyRow}>
              <Text style={{ fontSize: 13 }}>🔒</Text>
              <Text style={s.privacyText}>كل المعالجة داخل جهازك</Text>
            </View>
            <TouchableOpacity
              style={[s.aiBanner, geminiKey && s.aiBannerActive]}
              onPress={() => { setAiKeyInput(geminiKey); setShowAiSettings(true); }}>
              <Text style={{ fontSize: 14 }}>🤖</Text>
              <Text style={[s.aiBannerText, geminiKey && s.aiBannerTextActive]}>
                {geminiKey ? 'الذكاء الاصطناعي مُفعّل' : 'اضغط لإعداد الذكاء الاصطناعي'}
              </Text>
            </TouchableOpacity>
          </TouchableOpacity>

          {/* Camera + PDF Buttons */}
          <View style={s.twoBtns}>
            <TouchableOpacity style={s.cameraBtn} onPress={openCamera} activeOpacity={0.85}>
              <Text style={{ fontSize: 18 }}>📷</Text>
              <Text style={s.cameraBtnText}>الكاميرا</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.pdfBtn} onPress={pickPdf} activeOpacity={0.85}>
              <Text style={{ fontSize: 18 }}>📄</Text>
              <Text style={s.pdfBtnText}>رفع PDF</Text>
            </TouchableOpacity>
          </View>

          {/* Controls */}
          <View style={s.controlsCard}>
            <Text style={s.ctrlLabel}>✏️ اسم الملف النهائي</Text>
            <View style={s.inputWrap}>
              <TextInput
                style={s.input}
                value={fileName}
                onChangeText={setFileName}
                placeholder="اسم الملف..."
                placeholderTextColor={C.muted2}
                textAlign="right"
              />
            </View>
            <View style={s.optionsRow}>
              <View style={s.optCol}>
                <Text style={s.optLabel}>الجودة</Text>
                <View style={s.pillGroup}>
                  {['عالية', 'متوسطة'].map(q => (
                    <TouchableOpacity key={q} style={[s.pill, quality === q && s.pillActive]} onPress={() => setQuality(q)}>
                      <Text style={[s.pillText, quality === q && s.pillTextActive]}>{q}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              <View style={s.optCol}>
                <Text style={s.optLabel}>الحجم</Text>
                <View style={s.pillGroup}>
                  {['A4', 'Letter'].map(p => (
                    <TouchableOpacity key={p} style={[s.pill, pageSize === p && s.pillActive]} onPress={() => setPageSize(p)}>
                      <Text style={[s.pillText, pageSize === p && s.pillTextActive]}>{p}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>
          </View>

          {/* Images Section */}
          {images.length > 0 && (
            <View style={s.sectionWrap}>
              <View style={s.sectionHeader}>
                <View style={s.countWrap}>
                  <View style={s.countBar} />
                  <Text style={s.countLabel}>الصور :</Text>
                  <Text style={s.countNum}>{images.length}</Text>
                </View>
                <TouchableOpacity style={s.clearBtn} onPress={clearAll}>
                  <Text style={s.clearBtnText}>🗑️ مسح الكل</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={[s.aiAnalyzeBtn, isAnalyzing && { opacity: 0.6 }]}
                onPress={analyzeImages}
                disabled={isAnalyzing}>
                {isAnalyzing ? (
                  <>
                    <ActivityIndicator color={C.purple} size="small" />
                    <Text style={s.aiAnalyzeText}>جاري التحليل...</Text>
                  </>
                ) : (
                  <>
                    <Text style={{ fontSize: 16 }}>✨</Text>
                    <Text style={s.aiAnalyzeText}>تحليل ذكي واقتراح اسم</Text>
                  </>
                )}
              </TouchableOpacity>

              <Text style={s.dragHint}>✋ اضغط مطولاً على أي بطاقة لسحبها وإعادة ترتيبها</Text>

              <DraggableFlatList
                data={images}
                keyExtractor={(item) => item.id}
                onDragEnd={({ data }) => setImages(data)}
                renderItem={({ item, drag, isActive, getIndex }) => (
                  <DraggableImageCard
                    item={item}
                    index={getIndex() ?? 0}
                    total={images.length}
                    onDelete={removeImage}
                    onRotate={rotateImage}
                    drag={drag}
                    isActive={isActive}
                  />
                )}
                scrollEnabled={false}
                containerStyle={{ marginBottom: 8 }}
              />
            </View>
          )}

          {/* PDF Docs Section */}
          {pdfDocs.length > 0 && (
            <View style={s.sectionWrap}>
              <View style={s.sectionHeader}>
                <View style={s.countWrap}>
                  <View style={[s.countBar, { backgroundColor: C.purple }]} />
                  <Text style={s.countLabel}>PDF :</Text>
                  <Text style={[s.countNum, { color: C.purple }]}>{pdfDocs.length}</Text>
                </View>
                <TouchableOpacity style={s.scanAllBtn} onPress={() => scanAllPdfs()}>
                  <Text style={s.scanAllText}>🔄 فحص الكل</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity style={s.zipBtn} onPress={downloadAllAsZip}>
                <Text style={s.zipBtnText}>📦 تحميل الكل ZIP</Text>
              </TouchableOpacity>

              {pdfDocs.map((doc) => (
                <View key={doc.id} style={s.pdfCard}>
                  <View style={s.pdfHead}>
                    <View style={[s.pdfStatus, doc.status === 'done' && s.pdfStatusOk, doc.status === 'error' && s.pdfStatusErr]}>
                      <Text style={s.pdfStatusText}>
                        {doc.status === 'waiting' ? '⏳ انتظار' :
                         doc.status === 'scanning' ? '🔄 فحص...' :
                         doc.status === 'done' ? '✓ تم' : '✗ فشل'}
                      </Text>
                    </View>
                    <Text style={s.pdfName} numberOfLines={1}>{doc.name}</Text>
                    <TouchableOpacity onPress={() => removePdf(doc.id)} style={s.pdfDeleteBtn}>
                      <Text style={{ color: '#f87171', fontWeight: '900' }}>✕</Text>
                    </TouchableOpacity>
                  </View>

                  {doc.aiData && !doc.aiData.error && doc.aiData.summary && (
                    <Text style={s.pdfSummary}>{doc.aiData.summary}</Text>
                  )}
                  {doc.aiData?.error && (
                    <Text style={[s.pdfSummary, { color: '#f87171' }]}>{doc.aiData.error}</Text>
                  )}

                  <TextInput
                    style={s.pdfNameInput}
                    value={doc.newName}
                    onChangeText={(v) => setPdfDocs(prev => prev.map(d =>
                      d.id === doc.id ? { ...d, newName: v } : d))}
                    placeholder="اسم الملف الجديد..."
                    placeholderTextColor={C.muted2}
                    textAlign="right"
                  />

                  <TouchableOpacity style={s.pdfShareBtn} onPress={() => shareSinglePdf(doc)}>
                    <Text style={s.pdfShareText}>📤 تحميل / مشاركة</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          {/* Convert */}
          <TouchableOpacity
            style={[s.convertBtn, (images.length === 0 || isGenerating) && { opacity: 0.7 }]}
            onPress={generatePdf}
            disabled={images.length === 0 || isGenerating}
            activeOpacity={0.85}>
            <LinearGradient
              colors={images.length === 0 ? ['#334155', '#1e293b'] : ['#06b6d4', '#3b82f6', '#a855f7']}
              style={s.convertInner}>
              {isGenerating ? (
                <>
                  <ActivityIndicator color="#fff" />
                  <Text style={s.convertText}>جاري الإنشاء...</Text>
                </>
              ) : (
                <>
                  <Text style={{ fontSize: 20 }}>🪄</Text>
                  <Text style={s.convertText}>تحويل إلى PDF</Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>

          {/* Footer */}
          <View style={s.footer}>
            <View style={s.footerLine} />
            <Text style={s.footerLabel}>تطوير</Text>
            <Text style={s.footerName}>محمد نبيل السحيقي</Text>
            <Text style={s.footerEn}>Mohammed Nabil Al-Suhaigi</Text>
            <Text style={s.footerLove}>💖 بكل حب .. لخدمتكم</Text>
          </View>
          <View style={{ height: 40 }} />
        </ScrollView>

        {/* AI Settings Modal */}
        <Modal visible={showAiSettings} transparent animationType="fade" onRequestClose={() => setShowAiSettings(false)}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.modalOverlay}>
            <View style={s.modalCard}>
              <Text style={s.modalIcon}>🤖</Text>
              <Text style={s.modalTitle}>إعدادات الذكاء الاصطناعي</Text>
              <Text style={s.modalDesc}>أضف مفتاح Gemini المجاني لتفعيل التحليل واقتراح الأسماء.</Text>
              <View style={s.providerCard}>
                <View style={s.providerHead}>
                  <View style={s.providerLogo}><Text style={{ fontSize: 16 }}>💎</Text></View>
                  <Text style={s.providerName}>Google AI Studio</Text>
                  <View style={[s.providerStatus, geminiKey && s.providerStatusOn]}>
                    <Text style={[s.providerStatusText, geminiKey && s.providerStatusTextOn]}>
                      {geminiKey ? 'مُعد ✓' : 'غير متصل'}
                    </Text>
                  </View>
                </View>
                <TextInput
                  style={s.aiInput}
                  value={aiKeyInput}
                  onChangeText={setAiKeyInput}
                  placeholder="AIzaSy..."
                  placeholderTextColor={C.muted2}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <Text style={s.aiHint}>احصل على مفتاح مجاني من aistudio.google.com/app/apikey</Text>
              </View>
              <TouchableOpacity style={s.primaryBtn} onPress={saveAiKey}>
                <Text style={s.primaryBtnText}>💾 حفظ</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.secondaryBtn} onPress={() => setShowAiSettings(false)}>
                <Text style={s.secondaryBtnText}>إلغاء</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* AI Result Modal */}
        <Modal visible={showAiResult} transparent animationType="fade" onRequestClose={() => setShowAiResult(false)}>
          <ScrollView contentContainerStyle={s.modalOverlayScroll} style={{ flex: 1 }}>
            <View style={[s.modalCard, { maxWidth: 500 }]}>
              <Text style={s.modalIcon}>✨</Text>
              <Text style={s.modalTitle}>نتيجة التحليل</Text>
              {aiResult?.documents?.map((d, i) => (
                <View key={i} style={s.docRow}>
                  <Text style={s.docType}>{d.type}</Text>
                  {d.details ? <Text style={s.docDetails}>{d.details}</Text> : null}
                </View>
              ))}
              {aiResult?.summary ? <Text style={s.aiSummary}>{aiResult.summary}</Text> : null}
              {aiResult?.fileName ? (
                <View style={s.nameBox}>
                  <Text style={s.nameLabel}>✨ الاسم المقترح:</Text>
                  <TextInput
                    style={s.nameInput}
                    value={aiResult.fileName}
                    onChangeText={(v) => setAiResult({ ...aiResult, fileName: v })}
                  />
                  <TouchableOpacity style={s.applyBtn} onPress={() => {
                    setFileName(aiResult.fileName.replace(/\.pdf$/i, ''));
                    setShowAiResult(false);
                    Alert.alert('✓', 'تم التطبيق');
                  }}>
                    <Text style={s.applyText}>تطبيق</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
              <TouchableOpacity style={s.primaryBtn} onPress={() => setShowAiResult(false)}>
                <Text style={s.primaryBtnText}>✓ تم</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </Modal>

        {/* Share Modal */}
        <Modal visible={showShare} transparent animationType="fade" onRequestClose={() => setShowShare(false)}>
          <View style={s.modalOverlay}>
            <View style={s.modalCard}>
              <View style={s.successIcon}><Text style={{ fontSize: 40 }}>✓</Text></View>
              <Text style={s.shareTitle}>تم إنشاء PDF! 🎉</Text>
              <Text style={s.shareSub}>شارك الملف أو احفظه في جهازك</Text>
              <View style={s.fileInfo}>
                <Text style={{ fontSize: 32 }}>📄</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.fileName} numberOfLines={1}>{resultName}</Text>
                  <Text style={s.fileSize}>{fmtSize(resultSize)}</Text>
                </View>
              </View>

              <View style={s.shareGrid}>
                <TouchableOpacity style={s.shareItem} onPress={shareResult}>
                  <Text style={{ fontSize: 24 }}>📤</Text>
                  <Text style={s.shareItemText}>مشاركة</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.shareItem} onPress={shareWhatsApp}>
                  <Text style={{ fontSize: 24 }}>💬</Text>
                  <Text style={s.shareItemText}>واتساب</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.shareItem} onPress={shareTelegram}>
                  <Text style={{ fontSize: 24 }}>✈️</Text>
                  <Text style={s.shareItemText}>تليجرام</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.shareItem} onPress={shareEmail}>
                  <Text style={{ fontSize: 24 }}>📧</Text>
                  <Text style={s.shareItemText}>البريد</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity style={s.secondaryBtn} onPress={() => setShowShare(false)}>
                <Text style={s.secondaryBtnText}>إغلاق</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </View>
    </GestureHandlerRootView>
  );
}

/* ============================================================
   Styles
   ============================================================ */
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  aurora: { ...StyleSheet.absoluteFillObject, overflow: 'hidden' },
  orb: { position: 'absolute', borderRadius: 9999 },
  orbCyan: { width: SW * 1.3, height: SW * 1.3, top: -SW * 0.6, left: -SW * 0.25, backgroundColor: 'rgba(0,212,255,0.18)' },
  orbPurple: { width: SW * 1.2, height: SW * 1.2, bottom: -SW * 0.35, right: -SW * 0.45, backgroundColor: 'rgba(168,85,247,0.16)' },
  orbPink: { width: SW * 0.85, height: SW * 0.85, top: SH * 0.35, left: SW * 0.5, backgroundColor: 'rgba(236,72,153,0.12)' },
  scroll: { paddingHorizontal: 16, paddingTop: Platform.OS === 'android' ? 50 : 30 },

  header: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  logoBox: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, flex: 1 },
  logoIconWrap: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  logoIconText: { fontSize: 22 },
  logoTextBox: { flex: 1 },
  brandTitle: { color: C.cyan, fontSize: 20, fontWeight: '900', textAlign: 'right' },
  brandSub: { color: C.muted, fontSize: 12, textAlign: 'right' },
  aiBtn: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(168,85,247,0.12)', borderWidth: 1, borderColor: 'rgba(168,85,247,0.4)' },
  aiBtnActive: { backgroundColor: 'rgba(16,185,129,0.15)', borderColor: 'rgba(16,185,129,0.55)' },

  badgeWrap: { alignItems: 'center', marginBottom: 22 },
  badge: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, backgroundColor: 'rgba(13,26,60,0.7)', borderWidth: 1, borderColor: 'rgba(0,212,255,0.35)', paddingHorizontal: 18, paddingVertical: 8, borderRadius: 50 },
  badgeDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.green },
  badgeText: { color: '#e0f2fe', fontSize: 12, fontWeight: '700' },

  heroWrap: { alignItems: 'center', marginBottom: 22 },
  heroCanvas: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, height: 130 },
  heroCardBack: { width: 72, height: 82, borderRadius: 16, backgroundColor: 'rgba(15,23,42,0.9)', borderWidth: 1.5, borderColor: 'rgba(0,212,255,0.55)', alignItems: 'center', justifyContent: 'center' },
  heroArrow: { color: C.cyan, fontSize: 24, fontWeight: 'bold' },
  heroCardFront: { width: 82, height: 92, borderRadius: 18, backgroundColor: '#e11d48', alignItems: 'center', justifyContent: 'center' },
  heroPdf: { color: '#fff', fontSize: 10, fontWeight: '900', marginTop: 2 },

  titleWrap: { alignItems: 'center', marginBottom: 24 },
  taglineRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, marginBottom: 12 },
  taglineLine: { width: 30, height: 2, backgroundColor: C.cyan, borderRadius: 2 },
  tagline: { color: C.cyan2, fontSize: 12, fontWeight: '800', letterSpacing: 4, textTransform: 'uppercase' },
  mainTitle: { color: '#fff', fontSize: 28, fontWeight: '900', textAlign: 'center', lineHeight: 38, marginBottom: 12 },
  gradientText: { color: C.cyan },
  subtitle: { color: C.muted, fontSize: 14, textAlign: 'center', lineHeight: 22, paddingHorizontal: 12 },

  featuresGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 22, justifyContent: 'space-between' },
  featBox: { width: (SW - 44) / 2, backgroundColor: C.glass, borderWidth: 1, borderColor: C.stroke, borderRadius: 16, paddingVertical: 18, paddingHorizontal: 12, alignItems: 'center' },
  featIcon: { width: 46, height: 46, borderRadius: 14, backgroundColor: 'rgba(0,212,255,0.1)', borderWidth: 1, borderColor: 'rgba(0,212,255,0.25)', alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  featTitle: { color: '#fff', fontSize: 13, fontWeight: '800', marginBottom: 3 },
  featDesc: { color: C.muted, fontSize: 11, textAlign: 'center' },

  uploadCard: { backgroundColor: C.glass, borderRadius: 24, paddingVertical: 34, paddingHorizontal: 20, alignItems: 'center', marginBottom: 16, borderWidth: 2, borderColor: 'rgba(0,212,255,0.35)', borderStyle: 'dashed' },
  uploadRippleWrap: { width: 110, height: 110, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  uploadRipple: { position: 'absolute', width: 90, height: 90, borderRadius: 45, borderWidth: 1, borderColor: 'rgba(0,212,255,0.3)' },
  uploadCircle: { width: 90, height: 90, borderRadius: 45, backgroundColor: 'rgba(0,212,255,0.1)', borderWidth: 2, borderColor: 'rgba(0,212,255,0.35)', alignItems: 'center', justifyContent: 'center' },
  uploadTitle: { color: '#fff', fontSize: 17, fontWeight: '800', marginBottom: 6, textAlign: 'center' },
  uploadSub: { color: C.muted, fontSize: 13, marginBottom: 20, textAlign: 'center' },
  uploadBtn: { paddingVertical: 14, paddingHorizontal: 36, borderRadius: 14, marginBottom: 16 },
  uploadBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  privacyRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, marginBottom: 14 },
  privacyText: { color: C.muted2, fontSize: 11 },
  aiBanner: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: 'rgba(168,85,247,0.1)', borderWidth: 1, borderColor: 'rgba(168,85,247,0.35)' },
  aiBannerActive: { backgroundColor: 'rgba(16,185,129,0.1)', borderColor: 'rgba(16,185,129,0.4)' },
  aiBannerText: { color: C.purple, fontSize: 12, fontWeight: '700' },
  aiBannerTextActive: { color: C.green },

  twoBtns: { flexDirection: 'row-reverse', gap: 10, marginBottom: 18 },
  cameraBtn: { flex: 1, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14, backgroundColor: 'rgba(168,85,247,0.12)', borderWidth: 1, borderColor: 'rgba(168,85,247,0.4)' },
  cameraBtnText: { color: C.purple, fontSize: 13, fontWeight: '800' },
  pdfBtn: { flex: 1, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14, backgroundColor: 'rgba(239,68,68,0.12)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.4)' },
  pdfBtnText: { color: '#f87171', fontSize: 13, fontWeight: '800' },

  controlsCard: { backgroundColor: C.glass, borderRadius: 20, padding: 18, marginBottom: 18, borderWidth: 1, borderColor: C.stroke },
  ctrlLabel: { color: C.muted, fontSize: 12, fontWeight: '700', textAlign: 'right', marginBottom: 8 },
  inputWrap: { backgroundColor: 'rgba(2,6,23,0.7)', borderWidth: 1, borderColor: 'rgba(0,212,255,0.3)', borderRadius: 12, paddingHorizontal: 14, marginBottom: 14 },
  input: { height: 48, color: '#fff', fontSize: 14, fontWeight: '700' },
  optionsRow: { flexDirection: 'row-reverse', gap: 10 },
  optCol: { flex: 1 },
  optLabel: { color: C.muted, fontSize: 11, textAlign: 'right', marginBottom: 6, fontWeight: '600' },
  pillGroup: { flexDirection: 'row-reverse', gap: 4 },
  pill: { flex: 1, paddingVertical: 8, borderRadius: 10, backgroundColor: 'rgba(2,6,23,0.6)', borderWidth: 1, borderColor: 'rgba(0,212,255,0.2)', alignItems: 'center' },
  pillActive: { borderColor: C.cyan, backgroundColor: 'rgba(0,212,255,0.22)' },
  pillText: { color: C.muted, fontSize: 11, fontWeight: '700' },
  pillTextActive: { color: C.cyan },

  sectionWrap: { marginBottom: 18 },
  sectionHeader: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  countWrap: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  countBar: { width: 4, height: 22, backgroundColor: C.cyan, borderRadius: 2 },
  countLabel: { color: '#cbd5e1', fontSize: 14, fontWeight: '800' },
  countNum: { color: C.cyan, fontSize: 20, fontWeight: '900', backgroundColor: 'rgba(0,212,255,0.12)', borderWidth: 1, borderColor: 'rgba(0,212,255,0.35)', paddingHorizontal: 12, paddingVertical: 2, borderRadius: 8 },
  clearBtn: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10, backgroundColor: 'rgba(239,68,68,0.1)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.4)' },
  clearBtnText: { color: '#f87171', fontSize: 12, fontWeight: '800' },

  aiAnalyzeBtn: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(168,85,247,0.5)', backgroundColor: 'rgba(168,85,247,0.15)' },
  aiAnalyzeText: { color: C.purple, fontSize: 14, fontWeight: '800' },

  dragHint: { color: C.muted2, fontSize: 11, textAlign: 'right', marginBottom: 10, paddingRight: 4 },

  dragCard: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, backgroundColor: 'rgba(2,6,23,0.7)', borderRadius: 14, padding: 10, marginBottom: 10, borderWidth: 1, borderColor: 'rgba(0,212,255,0.18)' },
  dragCardActive: { borderColor: C.cyan, backgroundColor: 'rgba(0,212,255,0.1)', transform: [{ scale: 1.02 }] },
  dragThumb: { width: 80, height: 80, borderRadius: 10, overflow: 'hidden', backgroundColor: '#020612', position: 'relative' },
  dragThumbImg: { width: '100%', height: '100%' },
  dragIndexBadge: { position: 'absolute', top: 4, right: 4, backgroundColor: 'rgba(0,0,0,0.8)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 },
  dragIndexText: { color: '#fff', fontSize: 9, fontWeight: '800' },
  dragHandle: { position: 'absolute', bottom: 4, right: 4, backgroundColor: 'rgba(0,212,255,0.85)', width: 22, height: 22, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  dragHandleIcon: { color: '#050816', fontSize: 12, fontWeight: '900' },
  dragInfo: { flex: 1 },
  dragFileName: { color: '#fff', fontSize: 14, fontWeight: '800', textAlign: 'right', marginBottom: 8 },
  dragActions: { flexDirection: 'row-reverse', gap: 8 },
  dragBtn: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,212,255,0.15)', borderWidth: 1, borderColor: 'rgba(0,212,255,0.4)' },
  dragBtnRed: { backgroundColor: 'rgba(239,68,68,0.15)', borderColor: 'rgba(239,68,68,0.4)' },
  dragBtnIcon: { fontSize: 14 },

  scanAllBtn: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10, backgroundColor: 'rgba(168,85,247,0.15)', borderWidth: 1, borderColor: 'rgba(168,85,247,0.45)' },
  scanAllText: { color: C.purple, fontSize: 12, fontWeight: '800' },

  zipBtn: { paddingVertical: 12, borderRadius: 12, backgroundColor: 'rgba(16,185,129,0.15)', borderWidth: 1, borderColor: 'rgba(16,185,129,0.45)', alignItems: 'center', marginBottom: 12 },
  zipBtnText: { color: C.green, fontSize: 14, fontWeight: '800' },

  pdfCard: { backgroundColor: 'rgba(15,23,42,0.75)', borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: 'rgba(0,212,255,0.2)' },
  pdfHead: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 10 },
  pdfStatus: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20, backgroundColor: 'rgba(107,114,128,0.2)', borderWidth: 1, borderColor: 'rgba(107,114,128,0.4)' },
  pdfStatusOk: { backgroundColor: 'rgba(16,185,129,0.2)', borderColor: 'rgba(16,185,129,0.5)' },
  pdfStatusErr: { backgroundColor: 'rgba(239,68,68,0.2)', borderColor: 'rgba(239,68,68,0.5)' },
  pdfStatusText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  pdfName: { flex: 1, color: '#cbd5e1', fontSize: 12, fontWeight: '700', textAlign: 'right' },
  pdfDeleteBtn: { width: 28, height: 28, borderRadius: 8, backgroundColor: 'rgba(239,68,68,0.15)', alignItems: 'center', justifyContent: 'center' },
  pdfSummary: { color: C.muted, fontSize: 11, lineHeight: 17, textAlign: 'right', marginBottom: 10 },
  pdfNameInput: { backgroundColor: 'rgba(2,6,23,0.7)', borderWidth: 1, borderColor: 'rgba(0,212,255,0.25)', borderRadius: 10, paddingHorizontal: 12, height: 42, color: '#fff', fontSize: 12, fontWeight: '700', marginBottom: 8 },
  pdfShareBtn: { paddingVertical: 10, borderRadius: 10, backgroundColor: 'rgba(0,212,255,0.15)', borderWidth: 1, borderColor: 'rgba(0,212,255,0.4)', alignItems: 'center' },
  pdfShareText: { color: C.cyan, fontSize: 12, fontWeight: '800' },

  convertBtn: { borderRadius: 16, overflow: 'hidden', marginBottom: 24 },
  convertInner: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 12, paddingVertical: 18 },
  convertText: { color: '#fff', fontSize: 16, fontWeight: '900' },

  footer: { alignItems: 'center', paddingVertical: 30 },
  footerLine: { width: 80, height: 2, backgroundColor: C.cyan, borderRadius: 2, marginBottom: 20 },
  footerLabel: { color: C.muted2, fontSize: 11, letterSpacing: 6, textTransform: 'uppercase', marginBottom: 8, fontWeight: '600' },
  footerName: { color: '#fff', fontSize: 26, fontWeight: '900', marginBottom: 6 },
  footerEn: { color: C.muted, fontSize: 12, letterSpacing: 3, marginBottom: 16, textTransform: 'uppercase' },
  footerLove: { color: C.muted2, fontSize: 13 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center', padding: 22 },
  modalOverlayScroll: { flexGrow: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center', padding: 22 },
  modalCard: { width: '100%', maxWidth: 440, backgroundColor: '#0a0f24', borderWidth: 1, borderColor: 'rgba(0,212,255,0.3)', borderRadius: 24, padding: 24, alignItems: 'center' },
  modalIcon: { fontSize: 52, marginBottom: 10 },
  modalTitle: { color: '#fff', fontSize: 20, fontWeight: '900', marginBottom: 10, textAlign: 'center' },
  modalDesc: { color: C.muted, fontSize: 13, textAlign: 'center', lineHeight: 20, marginBottom: 20 },

  primaryBtn: { width: '100%', paddingVertical: 15, borderRadius: 14, backgroundColor: C.cyan, alignItems: 'center', marginTop: 14 },
  primaryBtnText: { color: '#050816', fontSize: 15, fontWeight: '900' },
  secondaryBtn: { width: '100%', paddingVertical: 13, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', alignItems: 'center', marginTop: 10 },
  secondaryBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  providerCard: { width: '100%', padding: 14, backgroundColor: 'rgba(0,0,0,0.3)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', borderRadius: 12, marginBottom: 8 },
  providerHead: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, marginBottom: 12 },
  providerLogo: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#4285f4' },
  providerName: { color: '#fff', fontSize: 13, fontWeight: '700', flex: 1, textAlign: 'right' },
  providerStatus: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20, backgroundColor: 'rgba(107,114,128,0.2)', borderWidth: 1, borderColor: 'rgba(107,114,128,0.3)' },
  providerStatusOn: { backgroundColor: 'rgba(16,185,129,0.15)', borderColor: 'rgba(16,185,129,0.4)' },
  providerStatusText: { color: C.muted, fontSize: 11, fontWeight: '800' },
  providerStatusTextOn: { color: C.green },
  aiInput: { width: '100%', backgroundColor: 'rgba(2,6,23,0.7)', borderWidth: 1, borderColor: 'rgba(0,212,255,0.25)', borderRadius: 10, paddingHorizontal: 14, height: 48, color: '#fff', fontSize: 13, fontWeight: '700' },
  aiHint: { color: C.muted2, fontSize: 10, marginTop: 8, textAlign: 'center' },

  docRow: { width: '100%', padding: 10, borderRadius: 10, backgroundColor: 'rgba(0,212,255,0.1)', borderWidth: 1, borderColor: 'rgba(0,212,255,0.35)', marginBottom: 8 },
  docType: { color: '#fff', fontSize: 13, fontWeight: '800', textAlign: 'right' },
  docDetails: { color: C.muted, fontSize: 11, textAlign: 'right', marginTop: 3 },

  aiSummary: { width: '100%', color: '#cbd5e1', fontSize: 13, textAlign: 'right', lineHeight: 20, marginVertical: 12 },
  nameBox: { width: '100%', padding: 14, borderRadius: 14, backgroundColor: 'rgba(168,85,247,0.12)', borderWidth: 1, borderColor: 'rgba(168,85,247,0.4)', marginBottom: 8 },
  nameLabel: { color: C.purple, fontSize: 12, fontWeight: '800', textAlign: 'right', marginBottom: 10 },
  nameInput: { backgroundColor: 'rgba(2,6,23,0.7)', borderWidth: 1, borderColor: 'rgba(168,85,247,0.5)', borderRadius: 10, paddingHorizontal: 12, height: 44, color: '#fff', fontSize: 13, fontWeight: '800', textAlign: 'right', marginBottom: 10 },
  applyBtn: { paddingVertical: 12, borderRadius: 10, backgroundColor: C.cyan, alignItems: 'center' },
  applyText: { color: '#050816', fontSize: 13, fontWeight: '900' },

  successIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  shareTitle: { color: '#fff', fontSize: 20, fontWeight: '900', marginBottom: 8, textAlign: 'center' },
  shareSub: { color: C.muted, fontSize: 13, textAlign: 'center', marginBottom: 20 },
  fileInfo: { width: '100%', flexDirection: 'row-reverse', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, backgroundColor: 'rgba(0,212,255,0.06)', borderWidth: 1, borderColor: 'rgba(0,212,255,0.2)', marginBottom: 16 },
  fileName: { color: '#fff', fontSize: 13, fontWeight: '800', textAlign: 'right' },
  fileSize: { color: C.muted, fontSize: 11, textAlign: 'right', marginTop: 3 },
  shareGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12, width: '100%' },
  shareItem: { flex: 1, minWidth: '22%', paddingVertical: 14, borderRadius: 12, backgroundColor: 'rgba(0,212,255,0.08)', borderWidth: 1, borderColor: 'rgba(0,212,255,0.25)', alignItems: 'center', gap: 6 },
  shareItemText: { color: '#fff', fontSize: 11, fontWeight: '800' },
});
