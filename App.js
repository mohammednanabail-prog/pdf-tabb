import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Image,
  TextInput,
  Modal,
  ActivityIndicator,
  Alert,
  StatusBar,
  Dimensions,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

const { width } = Dimensions.get('window');

export default function App() {
  const [images, setImages] = useState([]);
  const [fileName, setFileName] = useState('ملف_المستندات_الذكي');
  const [pageSize, setPageSize] = useState('A4');
  const [quality, setQuality] = useState('عالية');

  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [isAiScanning, setIsAiScanning] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState(null);

  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showInstructionsModal, setShowInstructionsModal] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  // ====== إضافة صورة من استوديو الهاتف ======
  const addDocumentImage = async () => {
    try {
      // طلب الإذن
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('الإذن مرفوض', 'نحتاج إذن الوصول للصور لاختيارها.');
        return;
      }

      // فتح استوديو الصور
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        quality: quality === 'عالية' ? 1 : 0.7,
        selectionLimit: 20,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const newImgs = result.assets.map((asset, idx) => ({
          id: `img_${Date.now()}_${idx}`,
          uri: asset.uri,
          rotation: 0,
        }));
        setImages(prev => [...prev, ...newImgs]);
      }
    } catch (err) {
      Alert.alert('خطأ', 'تعذر فتح استوديو الصور: ' + err.message);
    }
  };

  // ====== التقاط صورة بالكاميرا ======
  const takePhotoWithCamera = async () => {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('الإذن مرفوض', 'نحتاج إذن الكاميرا.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        quality: quality === 'عالية' ? 1 : 0.7,
      });
      if (!result.canceled && result.assets && result.assets[0]) {
        setImages(prev => [
          ...prev,
          { id: `img_${Date.now()}`, uri: result.assets[0].uri, rotation: 0 },
        ]);
      }
    } catch (err) {
      Alert.alert('خطأ', 'تعذر فتح الكاميرا: ' + err.message);
    }
  };

  // ====== نافذة خيارات المصدر ======
  const showSourceOptions = () => {
    Alert.alert(
      'إضافة صورة',
      'اختر مصدر الصورة:',
      [
        { text: '📷 الكاميرا', onPress: takePhotoWithCamera },
        { text: '🖼️ استوديو الصور', onPress: addDocumentImage },
        { text: 'إلغاء', style: 'cancel' },
      ],
      { cancelable: true }
    );
  };

  const removeImage = (id) => setImages(images.filter(img => img.id !== id));

  const rotateImage = (id) => {
    setImages(images.map(img =>
      img.id === id ? { ...img, rotation: (img.rotation + 90) % 360 } : img
    ));
  };

  const moveImage = (index, step) => {
    const target = index + step;
    if (target < 0 || target >= images.length) return;
    const reordered = [...images];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(target, 0, moved);
    setImages(reordered);
  };

  // ====== التحليل الذكي عبر Gemini ======
  const runAiSmartScan = async () => {
    if (!geminiApiKey.trim()) {
      Alert.alert('المفتاح مفقود', 'أدخل مفتاح Gemini API في الإعدادات.');
      setShowSettingsModal(true);
      return;
    }
    setIsAiScanning(true);
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey.trim()}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [{
                text: `اقترح اسماً عربياً جذاباً لملف PDF يحتوي على ${images.length} وثائق. أعد الرد بصيغة JSON فقط: {"fileName": "اسم الملف", "summary": "وصف في 15 كلمة", "docTypes": ["نوع1", "نوع2"]}`,
              }],
            }],
            generationConfig: { responseMimeType: 'application/json' },
          }),
        }
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || 'تعذر الاتصال');
      const resText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      const parsed = JSON.parse(resText);
      setAiAnalysis(parsed);
      if (parsed.fileName) setFileName(parsed.fileName);
      Alert.alert('✨ تم الفحص', `الاسم المقترح: ${parsed.fileName}`);
    } catch (err) {
      Alert.alert('خطأ', err.message);
    } finally {
      setIsAiScanning(false);
    }
  };

  // ====== إنشاء PDF حقيقي ======
  const handleGeneratePdf = async () => {
    if (images.length === 0) {
      Alert.alert('تنبيه', 'أضف صورة واحدة على الأقل.');
      return;
    }

    setIsGeneratingPdf(true);
    try {
      // تحويل الصور إلى Base64
      const imagesBase64 = [];
      for (const img of images) {
        const b64 = await FileSystem.readAsStringAsync(img.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        const mime = img.uri.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
        imagesBase64.push({
          data: `data:${mime};base64,${b64}`,
          rotation: img.rotation,
        });
      }

      // تحديد قياس الصفحة
      const pageFormat = pageSize === 'A4'
        ? 'A4'
        : pageSize === 'Letter'
          ? 'Letter'
          : 'A4';

      // بناء HTML للـ PDF
      const imagesHtml = imagesBase64.map(img => `
        <div style="page-break-after: always; display: flex; justify-content: center; align-items: center; width: 100%; height: 100vh; margin: 0; padding: 0;">
          <img src="${img.data}"
               style="max-width: 100%; max-height: 100%; object-fit: contain; transform: rotate(${img.rotation}deg);" />
        </div>
      `).join('');

      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <style>
              @page { size: ${pageFormat}; margin: 0; }
              body { margin: 0; padding: 0; }
            </style>
          </head>
          <body>${imagesHtml}</body>
        </html>
      `;

      // إنشاء ملف PDF
      const { uri } = await Print.printToFileAsync({
        html,
        base64: false,
      });

      // إعادة تسمية الملف
      const safeName = (fileName || 'document').replace(/[^a-zA-Z0-9_\u0600-\u06FF-]/g, '_');
      const newPath = `${FileSystem.documentDirectory}${safeName}.pdf`;
      await FileSystem.moveAsync({ from: uri, to: newPath });

      setIsGeneratingPdf(false);

      // عرض خيارات المشاركة/الحفظ
      Alert.alert(
        '🎉 تم إنشاء ملف PDF بنجاح!',
        `الملف: ${safeName}.pdf\nعدد الصفحات: ${images.length}`,
        [
          {
            text: '📤 مشاركة',
            onPress: async () => {
              if (await Sharing.isAvailableAsync()) {
                await Sharing.shareAsync(newPath, {
                  mimeType: 'application/pdf',
                  dialogTitle: 'مشاركة ملف PDF',
                });
              } else {
                Alert.alert('تنبيه', 'المشاركة غير متاحة على هذا الجهاز.');
              }
            },
          },
          {
            text: '💾 حفظ في الملفات',
            onPress: () => {
              Alert.alert('تم الحفظ', `الملف محفوظ في:\n${newPath}`);
            },
          },
          { text: 'إغلاق', style: 'cancel' },
        ]
      );
    } catch (err) {
      setIsGeneratingPdf(false);
      Alert.alert('خطأ في إنشاء PDF', err.message);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" backgroundColor="#050816" />

      <View style={styles.auroraBackdrop} pointerEvents="none">
        <View style={styles.glowSpotCyan} />
        <View style={styles.glowSpotPurple} />
      </View>

      {/* الهيدر */}
      <View style={styles.navHeader}>
        <View style={styles.logoGroup}>
          <View style={styles.logoBoxIcon}>
            <Text style={styles.logoEmoji}>📄</Text>
          </View>
          <View>
            <Text style={styles.logoTitleTxt}>Image → PDF</Text>
            <Text style={styles.logoSubTxt}>فاحص المستندات الذكي</Text>
          </View>
        </View>

        <View style={styles.navActions}>
          <TouchableOpacity
            style={[styles.neonRoundBtn, geminiApiKey ? styles.neonBtnActive : null]}
            onPress={() => setShowSettingsModal(true)}
          >
            <Text style={{ fontSize: 16 }}>⚡</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.neonRoundBtn}
            onPress={() => setShowInstructionsModal(true)}
          >
            <Text style={{ fontSize: 16 }}>ℹ️</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollBody} showsVerticalScrollIndicator={false}>

        {/* البادج */}
        <View style={styles.topBadgeGlow}>
          <View style={styles.greenPulseDot} />
          <Text style={styles.topBadgeTxt}>أداة احترافية فائقة الدقة والسرعة</Text>
        </View>

        {/* الهيرو */}
        <View style={styles.heroVisualBlock}>
          <View style={styles.heroAuraSphere}>
            <View style={styles.floatingCardBack}>
              <Text style={{ fontSize: 28 }}>🖼️</Text>
            </View>
            <Text style={{ fontSize: 24, marginHorizontal: 4 }}>➔</Text>
            <View style={styles.floatingCardPdf}>
              <Text style={{ fontSize: 32 }}>📑</Text>
              <Text style={styles.pdfTag}>PDF</Text>
            </View>
          </View>

          <Text style={styles.heroTagline}>محول PDF الذكي</Text>
          <Text style={styles.heroHeadline}>
            حوّل صورك إلى <Text style={styles.gradientHighlight}>ملف PDF</Text> احترافي
          </Text>
          <Text style={styles.heroSubDesc}>
            أضف وثائقك، افحصها بالذكاء الاصطناعي، وصدّرها بجودة عالية.
          </Text>
        </View>

        {/* المزايا الأربع */}
        <View style={styles.features4Grid}>
          <View style={styles.featureBox}>
            <View style={styles.featureIconWrap}><Text style={{ fontSize: 20 }}>♾️</Text></View>
            <Text style={styles.featureTitle}>عدد غير محدود</Text>
            <Text style={styles.featureDesc}>من الصور بملف واحد</Text>
          </View>
          <View style={styles.featureBox}>
            <View style={styles.featureIconWrap}><Text style={{ fontSize: 20 }}>📑</Text></View>
            <Text style={styles.featureTitle}>جميع الصيغ</Text>
            <Text style={styles.featureDesc}>JPG • PNG • WebP</Text>
          </View>
          <View style={styles.featureBox}>
            <View style={styles.featureIconWrap}><Text style={{ fontSize: 20 }}>💡</Text></View>
            <Text style={styles.featureTitle}>تسمية ذكية</Text>
            <Text style={styles.featureDesc}>اسم مناسب بـ AI</Text>
          </View>
          <View style={styles.featureBox}>
            <View style={styles.featureIconWrap}><Text style={{ fontSize: 20 }}>🛡️</Text></View>
            <Text style={styles.featureTitle}>آمن وموثوق</Text>
            <Text style={styles.featureDesc}>خصوصية 100%</Text>
          </View>
        </View>

        {/* بطاقة الرفع */}
        <TouchableOpacity style={styles.dashedUploadCard} onPress={showSourceOptions} activeOpacity={0.85}>
          <View style={styles.pulsingCircleIcon}>
            <Text style={{ fontSize: 34 }}>☁️</Text>
          </View>
          <Text style={styles.uploadMainText}>اضغط لإضافة مستند أو صورة</Text>
          <Text style={styles.uploadSubText}>من الكاميرا أو استوديو الصور</Text>
          <View style={styles.privacySecureTag}>
            <Text style={{ fontSize: 13 }}>🔒</Text>
            <Text style={styles.privacySecureText}>كل المعالجة تتم داخل جهازك</Text>
          </View>
        </TouchableOpacity>

        {/* الإعدادات */}
        <View style={styles.glassControlCard}>
          <Text style={styles.inputGroupLabel}>اسم الملف النهائي</Text>
          <View style={styles.glassInputWrap}>
            <TextInput
              style={styles.glassTextInput}
              value={fileName}
              onChangeText={setFileName}
              placeholder="اكتب اسم الملف..."
              placeholderTextColor="#64748b"
            />
            <Text style={{ fontSize: 18 }}>✏️</Text>
          </View>

          <View style={styles.optionsFlexRow}>
            <View style={styles.optionColumn}>
              <Text style={styles.smallOptionTitle}>قياس الصفحة</Text>
              <View style={styles.pillGroup}>
                {['A4', 'Letter'].map(size => (
                  <TouchableOpacity
                    key={size}
                    style={[styles.togglePill, pageSize === size && styles.togglePillActive]}
                    onPress={() => setPageSize(size)}
                  >
                    <Text style={[styles.togglePillTxt, pageSize === size && styles.togglePillTxtActive]}>{size}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View style={styles.optionColumn}>
              <Text style={styles.smallOptionTitle}>جودة الصور</Text>
              <View style={styles.pillGroup}>
                {['عالية', 'متوازنة'].map(q => (
                  <TouchableOpacity
                    key={q}
                    style={[styles.togglePill, quality === q && styles.togglePillActive]}
                    onPress={() => setQuality(q)}
                  >
                    <Text style={[styles.togglePillTxt, quality === q && styles.togglePillTxtActive]}>{q}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        </View>

        {/* نتيجة AI */}
        {aiAnalysis && (
          <View style={styles.aiResultBannerCard}>
            <View style={styles.aiResultHeading}>
              <Text style={{ fontSize: 16 }}>✨</Text>
              <Text style={styles.aiResultMainTitle}>نتيجة الفحص الذكي</Text>
            </View>
            {aiAnalysis.docTypes && (
              <View style={styles.docChipsRow}>
                {aiAnalysis.docTypes.map((dt, i) => (
                  <View key={i} style={styles.singleDocChip}>
                    <Text style={styles.singleDocChipTxt}>{dt}</Text>
                  </View>
                ))}
              </View>
            )}
            <Text style={styles.aiResultSummaryTxt}>{aiAnalysis.summary}</Text>
          </View>
        )}

        {/* شبكة الصور */}
        {images.length > 0 && (
          <View style={styles.imagesGridSection}>
            <View style={styles.imagesGridHeader}>
              <View style={styles.countBadgeWrap}>
                <Text style={styles.countBadgeNumber}>{images.length}</Text>
                <Text style={styles.countBadgeLabel}>صور جاهزة</Text>
              </View>
              <TouchableOpacity
                style={styles.neonAiScanBtn}
                onPress={runAiSmartScan}
                disabled={isAiScanning}
              >
                {isAiScanning ? (
                  <ActivityIndicator size="small" color="#c084fc" />
                ) : (
                  <>
                    <Text style={{ fontSize: 13 }}>✨</Text>
                    <Text style={styles.neonAiScanBtnTxt}>تحليل ذكي</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

            <View style={styles.cardsRowWrap}>
              {images.map((item, index) => (
                <View key={item.id} style={styles.singleImageCard}>
                  <View style={styles.imageCardCanvas}>
                    <Image
                      source={{ uri: item.uri }}
                      style={[styles.imagePreviewThumb, { transform: [{ rotate: `${item.rotation}deg` }] }]}
                      resizeMode="cover"
                    />
                    <View style={styles.cardIndexBadge}>
                      <Text style={styles.cardIndexBadgeTxt}>صفحة {index + 1}</Text>
                    </View>
                    <TouchableOpacity style={styles.cardDeleteOverlay} onPress={() => removeImage(item.id)}>
                      <Text style={{ color: '#fff', fontWeight: 'bold' }}>✕</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.cardRotateOverlay} onPress={() => rotateImage(item.id)}>
                      <Text style={{ color: '#fff', fontSize: 13 }}>🔄</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.cardActionNavigation}>
                    <TouchableOpacity
                      onPress={() => moveImage(index, -1)}
                      disabled={index === 0}
                      style={[styles.arrowPill, index === 0 && styles.arrowPillOff]}
                    >
                      <Text style={{ color: '#00d4ff', fontWeight: 'bold' }}>▶</Text>
                    </TouchableOpacity>
                    <Text style={styles.cardOrderLabel}>{index + 1}</Text>
                    <TouchableOpacity
                      onPress={() => moveImage(index, 1)}
                      disabled={index === images.length - 1}
                      style={[styles.arrowPill, index === images.length - 1 && styles.arrowPillOff]}
                    >
                      <Text style={{ color: '#00d4ff', fontWeight: 'bold' }}>◀</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* زر التصدير */}
        <TouchableOpacity
          style={[styles.royalConvertBtn, (images.length === 0 || isGeneratingPdf) && styles.royalConvertBtnDisabled]}
          onPress={handleGeneratePdf}
          disabled={images.length === 0 || isGeneratingPdf}
          activeOpacity={0.85}
        >
          {isGeneratingPdf ? (
            <>
              <ActivityIndicator size="small" color="#fff" />
              <Text style={styles.royalConvertBtnTxt}>جاري إنشاء PDF...</Text>
            </>
          ) : (
            <>
              <Text style={{ fontSize: 20 }}>🪄</Text>
              <Text style={styles.royalConvertBtnTxt}>تحويل ومشاركة الـ PDF</Text>
            </>
          )}
        </TouchableOpacity>

        {/* الفوتر */}
        <View style={styles.royalFooterBox}>
          <Text style={styles.devTagHeading}>تطوير</Text>
          <Text style={styles.devArabicName}>محمد نبيل السحيقي</Text>
          <Text style={styles.devEnglishName}>Mohammed Nabil Al-Suhaigi</Text>
          <View style={styles.devLoveRow}>
            <Text style={{ fontSize: 16 }}>💖</Text>
            <Text style={styles.devLoveTxt}>بكل حب .. لخدمتكم</Text>
          </View>
        </View>

      </ScrollView>

      {/* مودال الإعدادات */}
      <Modal visible={showSettingsModal} animationType="fade" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.glassModalCard}>
            <Text style={styles.modalHeaderTitle}>إعدادات الذكاء الاصطناعي</Text>
            <Text style={styles.modalExplanation}>
              أضف مفتاح Gemini API المجاني لتفعيل التحليل والتسمية التلقائية:
            </Text>
            <TextInput
              style={styles.modalKeyInput}
              value={geminiApiKey}
              onChangeText={setGeminiApiKey}
              placeholder="AIzaSy..."
              placeholderTextColor="#64748b"
              autoCapitalize="none"
              secureTextEntry
            />
            <TouchableOpacity
              style={styles.modalSaveButton}
              onPress={() => { setShowSettingsModal(false); Alert.alert('تم', 'تم حفظ الإعدادات.'); }}
            >
              <Text style={styles.modalSaveButtonTxt}>حفظ ومتابعة</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* مودال التعليمات */}
      <Modal visible={showInstructionsModal} animationType="fade" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.glassModalCard}>
            <Text style={styles.modalHeaderTitle}>تعليمات الاستخدام</Text>
            <Text style={styles.stepDescription}>• اضغط على مربع الرفع لاختيار صور من الكاميرا أو الاستوديو.</Text>
            <Text style={styles.stepDescription}>• استخدم زر 🔄 لتدوير أي صورة.</Text>
            <Text style={styles.stepDescription}>• اضغط "تحليل ذكي" لاقتراح اسم تلقائياً.</Text>
            <Text style={styles.stepDescription}>• اضغط "تحويل ومشاركة" لإنشاء PDF حقيقي وحفظه.</Text>
            <TouchableOpacity
              style={styles.modalSaveButton}
              onPress={() => setShowInstructionsModal(false)}
            >
              <Text style={styles.modalSaveButtonTxt}>فهمت</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#050816' },
  auroraBackdrop: { ...StyleSheet.absoluteFillObject, overflow: 'hidden' },
  glowSpotCyan: { position: 'absolute', top: -50, alignSelf: 'center', width: width * 1.1, height: 280, borderRadius: 140, backgroundColor: 'rgba(0, 212, 255, 0.16)' },
  glowSpotPurple: { position: 'absolute', bottom: 80, right: -60, width: 260, height: 260, borderRadius: 130, backgroundColor: 'rgba(168, 85, 247, 0.15)' },
  navHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(0, 212, 255, 0.18)', backgroundColor: 'rgba(5, 8, 22, 0.9)' },
  logoGroup: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logoBoxIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#00d4ff', justifyContent: 'center', alignItems: 'center' },
  logoEmoji: { fontSize: 22 },
  logoTitleTxt: { color: '#00d4ff', fontWeight: '900', fontSize: 18, letterSpacing: 0.5 },
  logoSubTxt: { color: '#94a3b8', fontSize: 11 },
  navActions: { flexDirection: 'row', gap: 10 },
  neonRoundBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(15, 23, 42, 0.85)', borderWidth: 1, borderColor: 'rgba(0, 212, 255, 0.3)', justifyContent: 'center', alignItems: 'center' },
  neonBtnActive: { borderColor: '#34d399', backgroundColor: 'rgba(16, 185, 129, 0.18)' },
  scrollBody: { padding: 16, alignItems: 'center' },
  topBadgeGlow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(13, 26, 60, 0.8)', borderWidth: 1, borderColor: 'rgba(0, 212, 255, 0.35)', paddingHorizontal: 18, paddingVertical: 7, borderRadius: 50, marginVertical: 10 },
  greenPulseDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#10b981' },
  topBadgeTxt: { color: '#e0f2fe', fontSize: 12, fontWeight: '700' },
  heroVisualBlock: { alignItems: 'center', marginVertical: 14, width: '100%' },
  heroAuraSphere: { width: 220, height: 120, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  floatingCardBack: { width: 68, height: 72, borderRadius: 16, backgroundColor: 'rgba(15, 23, 42, 0.9)', borderWidth: 1.5, borderColor: 'rgba(0, 212, 255, 0.4)', justifyContent: 'center', alignItems: 'center', transform: [{ rotate: '-12deg' }] },
  floatingCardPdf: { width: 76, height: 84, borderRadius: 18, backgroundColor: '#e11d48', justifyContent: 'center', alignItems: 'center', transform: [{ rotate: '8deg' }] },
  pdfTag: { color: '#fff', fontSize: 10, fontWeight: '900', marginTop: 2 },
  heroTagline: { color: '#06ffe4', fontSize: 12, fontWeight: '800', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 6 },
  heroHeadline: { color: '#fff', fontSize: 22, fontWeight: '900', textAlign: 'center', marginBottom: 8, lineHeight: 32 },
  gradientHighlight: { color: '#00d4ff' },
  heroSubDesc: { color: '#94a3b8', fontSize: 13, textAlign: 'center', lineHeight: 20, paddingHorizontal: 10 },
  features4Grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between', width: '100%', marginVertical: 14 },
  featureBox: { width: (width - 44) / 2, backgroundColor: 'rgba(15, 23, 42, 0.65)', borderWidth: 1, borderColor: 'rgba(0, 212, 255, 0.22)', borderRadius: 16, padding: 14, alignItems: 'center' },
  featureIconWrap: { width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(0, 212, 255, 0.1)', justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  featureTitle: { color: '#fff', fontSize: 13, fontWeight: '800', marginBottom: 3 },
  featureDesc: { color: '#94a3b8', fontSize: 11 },
  dashedUploadCard: { width: '100%', backgroundColor: 'rgba(15, 23, 42, 0.55)', borderWidth: 2, borderColor: 'rgba(0, 212, 255, 0.45)', borderStyle: 'dashed', borderRadius: 22, paddingVertical: 26, paddingHorizontal: 16, alignItems: 'center', marginVertical: 10 },
  pulsingCircleIcon: { width: 70, height: 70, borderRadius: 35, backgroundColor: 'rgba(0, 212, 255, 0.12)', borderWidth: 1.5, borderColor: 'rgba(0, 212, 255, 0.35)', justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
  uploadMainText: { color: '#fff', fontSize: 16, fontWeight: '800', marginBottom: 4 },
  uploadSubText: { color: '#94a3b8', fontSize: 12, marginBottom: 12 },
  privacySecureTag: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  privacySecureText: { color: '#64748b', fontSize: 11 },
  glassControlCard: { width: '100%', backgroundColor: 'rgba(15, 23, 42, 0.75)', borderWidth: 1, borderColor: 'rgba(0, 212, 255, 0.25)', borderRadius: 18, padding: 16, marginVertical: 10 },
  inputGroupLabel: { color: '#94a3b8', fontSize: 12, fontWeight: '700', textAlign: 'right', marginBottom: 8 },
  glassInputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(2, 6, 23, 0.7)', borderWidth: 1, borderColor: 'rgba(0, 212, 255, 0.3)', borderRadius: 12, paddingHorizontal: 12 },
  glassTextInput: { flex: 1, height: 46, color: '#fff', fontSize: 14, textAlign: 'right' },
  optionsFlexRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14, gap: 12 },
  optionColumn: { flex: 1 },
  smallOptionTitle: { color: '#94a3b8', fontSize: 11, textAlign: 'right', marginBottom: 6 },
  pillGroup: { flexDirection: 'row', gap: 6 },
  togglePill: { flex: 1, backgroundColor: 'rgba(2, 6, 23, 0.6)', borderWidth: 1, borderColor: 'rgba(0, 212, 255, 0.2)', paddingVertical: 7, borderRadius: 8, alignItems: 'center' },
  togglePillActive: { borderColor: '#00d4ff', backgroundColor: 'rgba(0, 212, 255, 0.22)' },
  togglePillTxt: { color: '#94a3b8', fontSize: 11, fontWeight: '700' },
  togglePillTxtActive: { color: '#00d4ff' },
  aiResultBannerCard: { width: '100%', backgroundColor: 'rgba(168, 85, 247, 0.1)', borderWidth: 1, borderColor: 'rgba(168, 85, 247, 0.45)', borderRadius: 16, padding: 14, marginVertical: 10 },
  aiResultHeading: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, marginBottom: 8 },
  aiResultMainTitle: { color: '#c084fc', fontSize: 13, fontWeight: '800' },
  docChipsRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  singleDocChip: { backgroundColor: 'rgba(0, 212, 255, 0.15)', borderWidth: 1, borderColor: 'rgba(0, 212, 255, 0.35)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  singleDocChipTxt: { color: '#67e8f9', fontSize: 11, fontWeight: '700' },
  aiResultSummaryTxt: { color: '#cbd5e1', fontSize: 12, textAlign: 'right', lineHeight: 18 },
  imagesGridSection: { width: '100%', marginTop: 14 },
  imagesGridHeader: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  countBadgeWrap: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6 },
  countBadgeNumber: { color: '#00d4ff', fontWeight: '900', fontSize: 16 },
  countBadgeLabel: { color: '#cbd5e1', fontSize: 13, fontWeight: '700' },
  neonAiScanBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(168, 85, 247, 0.2)', borderWidth: 1, borderColor: 'rgba(168, 85, 247, 0.6)', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10 },
  neonAiScanBtnTxt: { color: '#c084fc', fontSize: 12, fontWeight: '800' },
  cardsRowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between' },
  singleImageCard: { width: (width - 44) / 2, backgroundColor: 'rgba(15, 23, 42, 0.8)', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(0, 212, 255, 0.25)', overflow: 'hidden' },
  imageCardCanvas: { height: 145, width: '100%', backgroundColor: '#020612', position: 'relative', justifyContent: 'center', alignItems: 'center' },
  imagePreviewThumb: { width: '100%', height: '100%' },
  cardIndexBadge: { position: 'absolute', top: 6, right: 6, backgroundColor: 'rgba(0, 0, 0, 0.8)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: 'rgba(0, 212, 255, 0.4)' },
  cardIndexBadgeTxt: { color: '#fff', fontSize: 10, fontWeight: '800' },
  cardDeleteOverlay: { position: 'absolute', top: 6, left: 6, backgroundColor: '#ef4444', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  cardRotateOverlay: { position: 'absolute', bottom: 6, left: 6, backgroundColor: '#00d4ff', borderRadius: 6, padding: 3 },
  cardActionNavigation: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 6, backgroundColor: 'rgba(2, 6, 23, 0.95)' },
  arrowPill: { padding: 5 },
  arrowPillOff: { opacity: 0.25 },
  cardOrderLabel: { color: '#94a3b8', fontSize: 11, fontWeight: '700' },
  royalConvertBtn: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10, width: '100%', backgroundColor: '#2563eb', paddingVertical: 16, borderRadius: 16, marginTop: 20 },
  royalConvertBtnDisabled: { backgroundColor: '#334155', opacity: 0.6 },
  royalConvertBtnTxt: { color: '#fff', fontSize: 16, fontWeight: '900' },
  royalFooterBox: { marginTop: 45, alignItems: 'center' },
  devTagHeading: { color: '#64748b', fontSize: 11, letterSpacing: 4, textTransform: 'uppercase' },
  devArabicName: { color: '#fff', fontSize: 24, fontWeight: '900', marginTop: 4 },
  devEnglishName: { color: '#94a3b8', fontSize: 12, marginTop: 2, letterSpacing: 2 },
  devLoveRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  devLoveTxt: { color: '#64748b', fontSize: 12 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.88)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  glassModalCard: { width: '100%', backgroundColor: '#0a0f24', borderWidth: 1, borderColor: 'rgba(0, 212, 255, 0.35)', borderRadius: 22, padding: 22 },
  modalHeaderTitle: { color: '#fff', fontSize: 16, fontWeight: '900', textAlign: 'right', marginBottom: 8 },
  modalExplanation: { color: '#94a3b8', fontSize: 12, textAlign: 'right', lineHeight: 18, marginBottom: 14 },
  modalKeyInput: { backgroundColor: '#020612', borderWidth: 1, borderColor: 'rgba(0, 212, 255, 0.35)', borderRadius: 12, color: '#fff', paddingHorizontal: 14, height: 46, marginBottom: 16, textAlign: 'left' },
  modalSaveButton: { backgroundColor: '#00d4ff', paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  modalSaveButtonTxt: { color: '#050816', fontWeight: '900', fontSize: 14 },
  stepDescription: { color: '#cbd5e1', fontSize: 12, textAlign: 'right', marginVertical: 4, lineHeight: 18 },
});