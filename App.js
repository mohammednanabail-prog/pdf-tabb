import React, { useState, useRef, useEffect } from 'react';
import {
  StyleSheet, Text, View, TouchableOpacity, ScrollView, Image,
  TextInput, Modal, ActivityIndicator, Alert, StatusBar,
  Dimensions, Animated, Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

const { width: SW, height: SH } = Dimensions.get('window');
const CARD_W = (SW - 48) / 2;

const C = {
  bg: '#050816',
  cyan: '#00d4ff',
  cyan2: '#22d3ee',
  purple: '#a855f7',
  pink: '#ec4899',
  text: '#f8fafc',
  muted: '#94a3b8',
};

export default function App() {
  const [images, setImages] = useState([]);
  const [fileName, setFileName] = useState('ملف_المستندات_الذكي');
  const [pageSize, setPageSize] = useState('A4');
  const [quality, setQuality] = useState('عالية');
  const [isGenerating, setIsGenerating] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [resultUri, setResultUri] = useState(null);
  const [resultName, setResultName] = useState('');
  const [resultSize, setResultSize] = useState(0);

  const fadeIn = useRef(new Animated.Value(0)).current;
  const slideUp = useRef(new Animated.Value(30)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeIn, { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.timing(slideUp, { toValue: 0, duration: 700, useNativeDriver: true }),
    ]).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.15, duration: 1200, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const openGallery = async () => {
    try {
      let perm = await ImagePicker.getMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('الإذن مرفوض', 'نحتاج إذن الوصول للصور.');
          return;
        }
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        quality: quality === 'عالية' ? 1 : 0.75,
        base64: true,
        selectionLimit: 25,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const newImgs = result.assets.map((a, i) => ({
          id: 'img_' + Date.now() + '_' + i,
          uri: a.uri,
          base64: a.base64,
          mime: a.mimeType || 'image/jpeg',
          rotation: 0,
        }));
        setImages(prev => [...prev, ...newImgs]);
      }
    } catch (err) {
      Alert.alert('خطأ', 'تعذر فتح الاستوديو: ' + err.message);
    }
  };

  const openCamera = async () => {
    try {
      let perm = await ImagePicker.getCameraPermissionsAsync();
      if (!perm.granted) {
        perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('الإذن مرفوض', 'نحتاج إذن الكاميرا.');
          return;
        }
      }
      const result = await ImagePicker.launchCameraAsync({
        quality: quality === 'عالية' ? 1 : 0.75,
        base64: true,
      });
      if (!result.canceled && result.assets && result.assets[0]) {
        const a = result.assets[0];
        setImages(prev => [
          ...prev,
          {
            id: 'img_' + Date.now(),
            uri: a.uri,
            base64: a.base64,
            mime: a.mimeType || 'image/jpeg',
            rotation: 0,
          },
        ]);
      }
    } catch (err) {
      Alert.alert('خطأ', 'تعذر فتح الكاميرا: ' + err.message);
    }
  };

  const removeImage = (id) => {
    setImages(prev => prev.filter(img => img.id !== id));
  };

  const rotateImage = (id) => {
    setImages(prev =>
      prev.map(img =>
        img.id === id ? { ...img, rotation: (img.rotation + 90) % 360 } : img
      )
    );
  };

  const moveImage = (index, dir) => {
    const target = index + dir;
    if (target < 0 || target >= images.length) return;
    const copy = [...images];
    const [moved] = copy.splice(index, 1);
    copy.splice(target, 0, moved);
    setImages(copy);
  };

  const clearAll = () => {
    if (images.length === 0) return;
    Alert.alert('تأكيد', 'حذف جميع الصور؟', [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'حذف', style: 'destructive', onPress: () => setImages([]) },
    ]);
  };

  const generatePdf = async () => {
    if (images.length === 0) {
      Alert.alert('تنبيه', 'أضف صورة واحدة على الأقل.');
      return;
    }
    setIsGenerating(true);
    try {
      const pageFormat = pageSize === 'A4' ? 'A4' : pageSize === 'Letter' ? 'letter' : 'A4';

      const pagesHtml = [];
      for (const img of images) {
        if (!img.base64) {
          console.warn('تخطي صورة بدون base64');
          continue;
        }
        const mime = img.mime || 'image/jpeg';
        const rot = img.rotation || 0;
        pagesHtml.push(`
          <div class="page">
            <img src="data:${mime};base64,${img.base64}"
                 style="transform: rotate(${rot}deg);" />
          </div>
        `);
      }

      if (pagesHtml.length === 0) {
        throw new Error('لا توجد صور صالحة');
      }

      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8" />
          <style>
            @page { size: ${pageFormat}; margin: 0; padding: 0; }
            html, body { margin: 0; padding: 0; background: white; }
            .page {
              width: 100%;
              height: 100vh;
              display: flex;
              justify-content: center;
              align-items: center;
              page-break-after: always;
              overflow: hidden;
              background: white;
            }
            .page:last-child { page-break-after: auto; }
            img {
              max-width: 100%;
              max-height: 100%;
              object-fit: contain;
              display: block;
            }
          </style>
        </head>
        <body>${pagesHtml.join('')}</body>
        </html>
      `;

      const { uri } = await Print.printToFileAsync({ html, base64: false });

      // نستخدم الملف مباشرة بدون إعادة تسمية
      const safeName = (fileName || 'document')
        .replace(/\.pdf$/i, '')
        .replace(/[^a-zA-Z0-9_\u0600-\u06FF\-]/g, '_')
        .substring(0, 60) || 'document';

      setResultUri(uri);
      setResultName(safeName + '.pdf');
      setResultSize(0);
      setShowResult(true);
    } catch (err) {
      console.error(err);
      Alert.alert('خطأ في إنشاء PDF', err.message || 'حدث خطأ غير متوقع');
    } finally {
      setIsGenerating(false);
    }
  };

  const shareResult = async () => {
    if (!resultUri) return;
    try {
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(resultUri, {
          mimeType: 'application/pdf',
          dialogTitle: 'مشاركة ملف PDF',
          UTI: 'com.adobe.pdf',
        });
      } else {
        Alert.alert('تنبيه', 'المشاركة غير متاحة على هذا الجهاز.');
      }
    } catch (e) {
      Alert.alert('تعذر المشاركة', e.message);
    }
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="#050816" />

      <View style={styles.auroraBg} pointerEvents="none">
        <View style={[styles.glowOrb, styles.glowCyan]} />
        <View style={[styles.glowOrb, styles.glowPurple]} />
        <View style={[styles.glowOrb, styles.glowPink]} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        style={{ flex: 1 }}>

        <Animated.View style={[
          styles.header,
          { opacity: fadeIn, transform: [{ translateY: slideUp }] },
        ]}>
          <LinearGradient
            colors={['#00d4ff', '#a855f7']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.logoBox}>
            <Text style={styles.logoIcon}>📄</Text>
          </LinearGradient>
          <View style={styles.logoText}>
            <Text style={styles.brandTitle}>Image → PDF</Text>
            <Text style={styles.brandSub}>محول المستندات الذكي</Text>
          </View>
        </Animated.View>

        <Animated.View style={[
          styles.heroWrap,
          { opacity: fadeIn, transform: [{ translateY: slideUp }] },
        ]}>
          <View style={styles.heroCanvas}>
            <Animated.View style={[
              styles.heroCardBack,
              { transform: [{ rotate: '-12deg' }, { scale: pulseAnim }] },
            ]}>
              <Text style={{ fontSize: 28 }}>🖼️</Text>
            </Animated.View>
            <Text style={styles.heroArrow}>➜</Text>
            <View style={[styles.heroCardFront, { transform: [{ rotate: '8deg' }] }]}>
              <Text style={{ fontSize: 32 }}>📑</Text>
              <Text style={styles.pdfTag}>PDF</Text>
            </View>
          </View>

          <View style={styles.heroTaglineWrap}>
            <View style={styles.heroTaglineLine} />
            <Text style={styles.heroTagline}>محول PDF الذكي</Text>
          </View>

          <Text style={styles.heroTitle}>
            حوّل صورك إلى{' '}
            <Text style={styles.gradientText}>ملف PDF</Text>
            {'\n'}احترافي
          </Text>

          <Text style={styles.heroSub}>
            أضف وثائقك، رتّبها، وحوّلها إلى PDF بجودة عالية — كل المعالجة داخل جهازك.
          </Text>
        </Animated.View>

        <View style={styles.featuresGrid}>
          {[
            { icon: '♾️', title: 'عدد غير محدود', desc: 'من الصور بملف واحد' },
            { icon: '📑', title: 'جميع الصيغ', desc: 'JPG · PNG · WebP' },
            { icon: '💡', title: 'جودة عالية', desc: 'وضوح كامل' },
            { icon: '🛡️', title: 'آمن 100%', desc: 'دون رفع للخارج' },
          ].map((f, i) => (
            <View key={i} style={styles.featureBox}>
              <View style={styles.featureIconWrap}>
                <Text style={{ fontSize: 22 }}>{f.icon}</Text>
              </View>
              <Text style={styles.featureTitle}>{f.title}</Text>
              <Text style={styles.featureDesc}>{f.desc}</Text>
            </View>
          ))}
        </View>

        <TouchableOpacity
          style={styles.uploadCard}
          onPress={openGallery}
          activeOpacity={0.85}>
          <Animated.View style={[
            styles.uploadCircle,
            { transform: [{ scale: pulseAnim }] },
          ]}>
            <Text style={{ fontSize: 34 }}>☁️</Text>
          </Animated.View>
          <Text style={styles.uploadTitle}>اضغط لإضافة صور</Text>
          <Text style={styles.uploadSub}>من استوديو الصور مباشرة</Text>
          <View style={styles.privacyRow}>
            <Text style={{ fontSize: 12 }}>🔒</Text>
            <Text style={styles.privacyText}>كل المعالجة داخل جهازك</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={styles.cameraBtn} onPress={openCamera} activeOpacity={0.8}>
          <Text style={{ fontSize: 16 }}>📷</Text>
          <Text style={styles.cameraBtnText}>التقاط صورة بالكاميرا</Text>
        </TouchableOpacity>

        <View style={styles.card}>
          <Text style={styles.labelSmall}>✏️ اسم الملف النهائي</Text>
          <View style={styles.inputWrap}>
            <TextInput
              style={styles.input}
              value={fileName}
              onChangeText={setFileName}
              placeholder="اسم الملف..."
              placeholderTextColor="#64748b"
              textAlign="right"
            />
            <Text style={{ fontSize: 16 }}>🖊️</Text>
          </View>

          <View style={styles.optionsRow}>
            <View style={styles.optCol}>
              <Text style={styles.optLabel}>قياس الصفحة</Text>
              <View style={styles.pillGroup}>
                {['A4', 'Letter'].map(s => (
                  <TouchableOpacity
                    key={s}
                    style={[styles.pill, pageSize === s && styles.pillActive]}
                    onPress={() => setPageSize(s)}>
                    <Text style={[styles.pillText, pageSize === s && styles.pillTextActive]}>
                      {s}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.optCol}>
              <Text style={styles.optLabel}>الجودة</Text>
              <View style={styles.pillGroup}>
                {['عالية', 'متوسطة'].map(q => (
                  <TouchableOpacity
                    key={q}
                    style={[styles.pill, quality === q && styles.pillActive]}
                    onPress={() => setQuality(q)}>
                    <Text style={[styles.pillText, quality === q && styles.pillTextActive]}>
                      {q}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        </View>

        {images.length > 0 && (
          <View style={styles.gridSection}>
            <View style={styles.gridHeader}>
              <View style={styles.countWrap}>
                <Text style={styles.countNum}>{images.length}</Text>
                <Text style={styles.countLabel}>صورة جاهزة</Text>
              </View>
              <TouchableOpacity onPress={clearAll} style={styles.clearBtn}>
                <Text style={styles.clearBtnText}>🗑️ مسح الكل</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.grid}>
              {images.map((item, idx) => (
                <View key={item.id} style={styles.imgCard}>
                  <View style={styles.imgCanvas}>
                    <Image
                      source={{ uri: item.uri }}
                      style={[
                        styles.imgThumb,
                        { transform: [{ rotate: item.rotation + 'deg' }] },
                      ]}
                      resizeMode="cover"
                    />
                    <View style={styles.imgIndexBadge}>
                      <Text style={styles.imgIndexText}>{idx + 1}</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.imgDeleteBtn}
                      onPress={() => removeImage(item.id)}>
                      <Text style={styles.imgDeleteX}>✕</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.imgRotateBtn}
                      onPress={() => rotateImage(item.id)}>
                      <Text style={{ fontSize: 12 }}>🔄</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.imgNavRow}>
                    <TouchableOpacity
                      onPress={() => moveImage(idx, -1)}
                      disabled={idx === 0}
                      style={[styles.navBtn, idx === 0 && styles.navBtnOff]}>
                      <Text style={styles.navBtnText}>›</Text>
                    </TouchableOpacity>
                    <Text style={styles.imgNavLabel}>مكان {idx + 1}</Text>
                    <TouchableOpacity
                      onPress={() => moveImage(idx, 1)}
                      disabled={idx === images.length - 1}
                      style={[styles.navBtn, idx === images.length - 1 && styles.navBtnOff]}>
                      <Text style={styles.navBtnText}>‹</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        <TouchableOpacity
          style={[styles.convertBtn, (images.length === 0 || isGenerating) && styles.convertBtnOff]}
          onPress={generatePdf}
          disabled={images.length === 0 || isGenerating}
          activeOpacity={0.85}>
          <LinearGradient
            colors={images.length === 0 ? ['#334155', '#1e293b'] : ['#00d4ff', '#8b5cf6']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.convertBtnInner}>
            {isGenerating ? (
              <>
                <ActivityIndicator color="#fff" />
                <Text style={styles.convertBtnText}>جاري الإنشاء...</Text>
              </>
            ) : (
              <>
                <Text style={{ fontSize: 20 }}>🪄</Text>
                <Text style={styles.convertBtnText}>تحويل إلى PDF</Text>
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>

        <View style={styles.footer}>
          <Text style={styles.footerLabel}>تطوير</Text>
          <Text style={styles.footerName}>محمد نبيل السحيقي</Text>
          <Text style={styles.footerEn}>Mohammed Nabil Al-Suhaigi</Text>
          <Text style={styles.footerLove}>💖 بكل حب .. لخدمتكم</Text>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      <Modal
        visible={showResult}
        transparent
        animationType="fade"
        onRequestClose={() => setShowResult(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalEmoji}>🎉</Text>
            <Text style={styles.modalTitle}>تم إنشاء PDF بنجاح!</Text>
            <Text style={styles.modalDesc}>
              الملف: {resultName}
              {'\n'}عدد الصفحات: {images.length}
            </Text>

            <TouchableOpacity style={styles.modalPrimaryBtn} onPress={shareResult}>
              <Text style={styles.modalPrimaryBtnText}>📤 مشاركة / حفظ الملف</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.modalSecondaryBtn}
              onPress={() => setShowResult(false)}>
              <Text style={styles.modalSecondaryBtnText}>إغلاق</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  auroraBg: { ...StyleSheet.absoluteFillObject, overflow: 'hidden' },
  glowOrb: { position: 'absolute', borderRadius: 999 },
  glowCyan: {
    width: SW * 1.2, height: SW * 1.2,
    top: -SW * 0.6, left: -SW * 0.2,
    backgroundColor: 'rgba(0,212,255,0.16)',
  },
  glowPurple: {
    width: SW * 1.1, height: SW * 1.1,
    bottom: -SW * 0.3, right: -SW * 0.4,
    backgroundColor: 'rgba(168,85,247,0.15)',
  },
  glowPink: {
    width: SW * 0.8, height: SW * 0.8,
    top: SH * 0.4, left: SW * 0.5,
    backgroundColor: 'rgba(236,72,153,0.1)',
  },

  scroll: { paddingHorizontal: 16, paddingTop: Platform.OS === 'android' ? 50 : 30 },

  header: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, marginBottom: 26 },
  logoBox: {
    width: 48, height: 48, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  logoIcon: { fontSize: 22 },
  logoText: { flex: 1 },
  brandTitle: {
    color: C.cyan, fontSize: 20, fontWeight: '900', letterSpacing: 0.5,
    textAlign: 'right',
  },
  brandSub: { color: C.muted, fontSize: 12, textAlign: 'right' },

  heroWrap: { alignItems: 'center', marginBottom: 28 },
  heroCanvas: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, marginBottom: 18, height: 120,
  },
  heroCardBack: {
    width: 72, height: 82, borderRadius: 16,
    backgroundColor: 'rgba(15,23,42,0.9)',
    borderWidth: 1.5, borderColor: 'rgba(0,212,255,0.5)',
    alignItems: 'center', justifyContent: 'center',
  },
  heroArrow: { color: C.cyan, fontSize: 22, fontWeight: 'bold' },
  heroCardFront: {
    width: 82, height: 92, borderRadius: 18,
    backgroundColor: '#e11d48',
    alignItems: 'center', justifyContent: 'center',
  },
  pdfTag: { color: '#fff', fontSize: 10, fontWeight: '900', marginTop: 2 },
  heroTaglineWrap: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 10, marginBottom: 10,
  },
  heroTaglineLine: { width: 30, height: 2, backgroundColor: C.cyan, borderRadius: 2 },
  heroTagline: {
    color: C.cyan2, fontSize: 12, fontWeight: '800',
    letterSpacing: 4, textTransform: 'uppercase',
  },
  heroTitle: {
    color: '#fff', fontSize: 28, fontWeight: '900',
    textAlign: 'center', lineHeight: 38, marginBottom: 12,
  },
  gradientText: { color: C.cyan },
  heroSub: {
    color: C.muted, fontSize: 14, textAlign: 'center',
    lineHeight: 22, paddingHorizontal: 12,
  },

  featuresGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    gap: 10, marginBottom: 24,
  },
  featureBox: {
    width: CARD_W,
    backgroundColor: 'rgba(15,23,42,0.65)',
    borderWidth: 1, borderColor: 'rgba(0,212,255,0.2)',
    borderRadius: 16, paddingVertical: 18, paddingHorizontal: 12,
    alignItems: 'center',
  },
  featureIconWrap: {
    width: 46, height: 46, borderRadius: 14,
    backgroundColor: 'rgba(0,212,255,0.1)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 10,
  },
  featureTitle: { color: '#fff', fontSize: 13, fontWeight: '800', marginBottom: 3 },
  featureDesc: { color: C.muted, fontSize: 11, textAlign: 'center' },

  uploadCard: {
    backgroundColor: 'rgba(15,23,42,0.55)',
    borderRadius: 22, paddingVertical: 34, paddingHorizontal: 18,
    alignItems: 'center', marginBottom: 12,
    borderWidth: 2, borderColor: 'rgba(0,212,255,0.45)',
    borderStyle: 'dashed',
  },
  uploadCircle: {
    width: 78, height: 78, borderRadius: 39,
    backgroundColor: 'rgba(0,212,255,0.1)',
    borderWidth: 1.5, borderColor: 'rgba(0,212,255,0.4)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 14,
  },
  uploadTitle: { color: '#fff', fontSize: 17, fontWeight: '800', marginBottom: 5 },
  uploadSub: { color: C.muted, fontSize: 13, marginBottom: 12 },
  privacyRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6 },
  privacyText: { color: '#64748b', fontSize: 11 },

  cameraBtn: {
    flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 12, borderRadius: 14,
    backgroundColor: 'rgba(168,85,247,0.1)',
    borderWidth: 1, borderColor: 'rgba(168,85,247,0.35)',
    marginBottom: 20,
  },
  cameraBtnText: { color: '#c084fc', fontSize: 14, fontWeight: '700' },

  card: {
    backgroundColor: 'rgba(15,23,42,0.75)',
    borderWidth: 1, borderColor: 'rgba(0,212,255,0.22)',
    borderRadius: 18, padding: 16, marginBottom: 20,
  },
  labelSmall: {
    color: C.muted, fontSize: 12, fontWeight: '700',
    textAlign: 'right', marginBottom: 8,
  },
  inputWrap: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 10,
    backgroundColor: 'rgba(2,6,23,0.7)',
    borderWidth: 1, borderColor: 'rgba(0,212,255,0.3)',
    borderRadius: 12, paddingHorizontal: 12, marginBottom: 14,
  },
  input: { flex: 1, height: 46, color: '#fff', fontSize: 14 },
  optionsRow: { flexDirection: 'row-reverse', gap: 12 },
  optCol: { flex: 1 },
  optLabel: { color: C.muted, fontSize: 11, marginBottom: 6, textAlign: 'right' },
  pillGroup: { flexDirection: 'row-reverse', gap: 6 },
  pill: {
    flex: 1, paddingVertical: 8, borderRadius: 10,
    backgroundColor: 'rgba(2,6,23,0.6)',
    borderWidth: 1, borderColor: 'rgba(0,212,255,0.2)',
    alignItems: 'center',
  },
  pillActive: {
    borderColor: C.cyan, backgroundColor: 'rgba(0,212,255,0.22)',
  },
  pillText: { color: C.muted, fontSize: 12, fontWeight: '700' },
  pillTextActive: { color: C.cyan },

  gridSection: { marginBottom: 20 },
  gridHeader: {
    flexDirection: 'row-reverse', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 12,
  },
  countWrap: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  countNum: { color: C.cyan, fontSize: 20, fontWeight: '900' },
  countLabel: { color: '#cbd5e1', fontSize: 13, fontWeight: '700' },
  clearBtn: {
    paddingVertical: 6, paddingHorizontal: 12, borderRadius: 10,
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderWidth: 1, borderColor: 'rgba(239,68,68,0.35)',
  },
  clearBtnText: { color: '#f87171', fontSize: 12, fontWeight: '700' },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between' },
  imgCard: {
    width: CARD_W,
    backgroundColor: 'rgba(15,23,42,0.85)',
    borderRadius: 14, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(0,212,255,0.25)',
  },
  imgCanvas: {
    height: 150, backgroundColor: '#020612',
    position: 'relative', overflow: 'hidden',
  },
  imgThumb: { width: '100%', height: '100%' },
  imgIndexBadge: {
    position: 'absolute', top: 6, right: 6,
    backgroundColor: 'rgba(0,0,0,0.8)',
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6,
    borderWidth: 1, borderColor: 'rgba(0,212,255,0.5)',
  },
  imgIndexText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  imgDeleteBtn: {
    position: 'absolute', top: 6, left: 6,
    backgroundColor: '#ef4444',
    width: 24, height: 24, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  imgDeleteX: { color: '#fff', fontSize: 12, fontWeight: '900' },
  imgRotateBtn: {
    position: 'absolute', bottom: 6, left: 6,
    backgroundColor: C.cyan,
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  imgNavRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 6, paddingHorizontal: 8,
    backgroundColor: 'rgba(2,6,23,0.95)',
  },
  navBtn: { padding: 4 },
  navBtnOff: { opacity: 0.25 },
  navBtnText: { color: C.cyan, fontSize: 18, fontWeight: '900' },
  imgNavLabel: { color: C.muted, fontSize: 11, fontWeight: '700' },

  convertBtn: { borderRadius: 16, overflow: 'hidden', marginBottom: 20 },
  convertBtnOff: { opacity: 0.7 },
  convertBtnInner: {
    flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center',
    gap: 10, paddingVertical: 18,
  },
  convertBtnText: { color: '#fff', fontSize: 16, fontWeight: '900' },

  footer: { alignItems: 'center', paddingVertical: 30 },
  footerLabel: {
    color: '#64748b', fontSize: 11, letterSpacing: 5,
    textTransform: 'uppercase', marginBottom: 8,
  },
  footerName: { color: '#fff', fontSize: 24, fontWeight: '900' },
  footerEn: { color: C.muted, fontSize: 12, letterSpacing: 2, marginTop: 4 },
  footerLove: { color: '#64748b', fontSize: 12, marginTop: 12 },

  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.9)',
    alignItems: 'center', justifyContent: 'center', padding: 22,
  },
  modalCard: {
    width: '100%', maxWidth: 420,
    backgroundColor: '#0a0f24',
    borderWidth: 1, borderColor: 'rgba(0,212,255,0.35)',
    borderRadius: 24, padding: 26, alignItems: 'center',
  },
  modalEmoji: { fontSize: 56, marginBottom: 10 },
  modalTitle: {
    color: '#fff', fontSize: 20, fontWeight: '900',
    marginBottom: 10, textAlign: 'center',
  },
  modalDesc: {
    color: C.muted, fontSize: 13, textAlign: 'center',
    lineHeight: 20, marginBottom: 20,
  },
  modalPrimaryBtn: {
    width: '100%', paddingVertical: 14, borderRadius: 14,
    backgroundColor: C.cyan, alignItems: 'center', marginBottom: 10,
  },
  modalPrimaryBtnText: { color: '#050816', fontSize: 15, fontWeight: '900' },
  modalSecondaryBtn: {
    width: '100%', paddingVertical: 12, borderRadius: 14,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
  },
  modalSecondaryBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
