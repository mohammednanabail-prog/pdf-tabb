import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Image,
  Alert,
  StatusBar,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

const { width } = Dimensions.get('window');

export default function App() {
  const [images, setImages] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);

  const pickImages = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('الإذن مرفوض', 'نحتاج إذن الوصول للصور.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        quality: 0.9,
        selectionLimit: 20,
      });
      if (!result.canceled && result.assets) {
        const newImgs = result.assets.map((a, i) => ({
          id: 'img_' + Date.now() + '_' + i,
          uri: a.uri,
          rotation: 0,
        }));
        setImages(prev => [...prev, ...newImgs]);
      }
    } catch (err) {
      Alert.alert('خطأ', 'تعذر فتح الاستوديو: ' + err.message);
    }
  };

  const takePhoto = async () => {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('الإذن مرفوض', 'نحتاج إذن الكاميرا.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({ quality: 0.9 });
      if (!result.canceled && result.assets && result.assets[0]) {
        setImages(prev => [
          ...prev,
          { id: 'img_' + Date.now(), uri: result.assets[0].uri, rotation: 0 },
        ]);
      }
    } catch (err) {
      Alert.alert('خطأ', 'تعذر فتح الكاميرا: ' + err.message);
    }
  };

  const chooseSource = () => {
    Alert.alert('إضافة صورة', 'اختر مصدر الصورة:', [
      { text: '📷 الكاميرا', onPress: takePhoto },
      { text: '🖼️ استوديو الصور', onPress: pickImages },
      { text: 'إلغاء', style: 'cancel' },
    ]);
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

  const generatePdf = async () => {
    if (images.length === 0) {
      Alert.alert('تنبيه', 'أضف صورة واحدة على الأقل.');
      return;
    }
    setIsGenerating(true);
    try {
      const imagesHtml = images
        .map(img => {
          return '<div style="page-break-after: always; display:flex; justify-content:center; align-items:center; width:100%; height:100vh; margin:0; padding:0;">' +
            '<img src="' + img.uri + '" style="max-width:100%; max-height:100%; object-fit:contain; transform: rotate(' + img.rotation + 'deg);" />' +
            '</div>';
        })
        .join('');

      const html = '<!DOCTYPE html><html><head><meta charset="utf-8"><style>@page { size: A4; margin: 0; } body { margin: 0; padding: 0; }</style></head><body>' + imagesHtml + '</body></html>';

      const { uri } = await Print.printToFileAsync({ html });
      setIsGenerating(false);

      Alert.alert(
        '🎉 تم إنشاء PDF بنجاح!',
        'عدد الصفحات: ' + images.length,
        [
          {
            text: '📤 مشاركة',
            onPress: async () => {
              if (await Sharing.isAvailableAsync()) {
                await Sharing.shareAsync(uri, { mimeType: 'application/pdf' });
              } else {
                Alert.alert('تنبيه', 'المشاركة غير متاحة.');
              }
            },
          },
          { text: 'إغلاق', style: 'cancel' },
        ]
      );
    } catch (err) {
      setIsGenerating(false);
      Alert.alert('خطأ', 'تعذر إنشاء PDF: ' + err.message);
    }
  };

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor="#050816" />

      <View style={styles.header}>
        <Text style={styles.headerTitle}>📄 Image → PDF</Text>
        <Text style={styles.headerSub}>محول المستندات الذكي</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <TouchableOpacity style={styles.uploadCard} onPress={chooseSource} activeOpacity={0.85}>
          <Text style={{ fontSize: 48, marginBottom: 10 }}>☁️</Text>
          <Text style={styles.uploadTitle}>اضغط لإضافة صور</Text>
          <Text style={styles.uploadSub}>من الكاميرا أو استوديو الصور</Text>
        </TouchableOpacity>

        {images.length > 0 && (
          <View style={styles.gridSection}>
            <Text style={styles.gridTitle}>{images.length} صورة جاهزة</Text>
            <View style={styles.grid}>
              {images.map((item, index) => (
                <View key={item.id} style={styles.card}>
                  <Image
                    source={{ uri: item.uri }}
                    style={[styles.thumb, { transform: [{ rotate: item.rotation + 'deg' }] }]}
                    resizeMode="cover"
                  />
                  <View style={styles.indexBadge}>
                    <Text style={styles.indexText}>{index + 1}</Text>
                  </View>
                  <TouchableOpacity style={styles.deleteBtn} onPress={() => removeImage(item.id)}>
                    <Text style={styles.deleteTxt}>✕</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.rotateBtn} onPress={() => rotateImage(item.id)}>
                    <Text style={styles.rotateTxt}>🔄</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          </View>
        )}

        <TouchableOpacity
          style={[styles.convertBtn, (images.length === 0 || isGenerating) && styles.convertBtnDisabled]}
          onPress={generatePdf}
          disabled={images.length === 0 || isGenerating}
        >
          {isGenerating ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.convertTxt}>🪄 تحويل إلى PDF</Text>
          )}
        </TouchableOpacity>

        <View style={styles.footer}>
          <Text style={styles.footerName}>محمد نبيل السحيقي</Text>
          <Text style={styles.footerSub}>Mohammed Nabil Al-Suhaigi</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#050816' },
  header: {
    paddingHorizontal: 20,
    paddingTop: 40,
    paddingBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,212,255,0.2)',
  },
  headerTitle: { color: '#00d4ff', fontSize: 22, fontWeight: '900' },
  headerSub: { color: '#94a3b8', fontSize: 12, marginTop: 2 },
  scroll: { padding: 16, alignItems: 'center' },
  uploadCard: {
    width: '100%',
    paddingVertical: 40,
    paddingHorizontal: 20,
    backgroundColor: 'rgba(15,23,42,0.6)',
    borderRadius: 22,
    borderWidth: 2,
    borderColor: 'rgba(0,212,255,0.4)',
    borderStyle: 'dashed',
    alignItems: 'center',
    marginVertical: 12,
  },
  uploadTitle: { color: '#fff', fontSize: 18, fontWeight: '800', marginBottom: 4 },
  uploadSub: { color: '#94a3b8', fontSize: 13 },
  gridSection: { width: '100%', marginTop: 20 },
  gridTitle: {
    color: '#00d4ff',
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 12,
    textAlign: 'right',
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between' },
  card: {
    width: (width - 44) / 2,
    height: 160,
    backgroundColor: '#0f172a',
    borderRadius: 14,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: 'rgba(0,212,255,0.25)',
  },
  thumb: { width: '100%', height: '100%' },
  indexBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.8)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  indexText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  deleteBtn: {
    position: 'absolute',
    top: 6,
    left: 6,
    backgroundColor: '#ef4444',
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteTxt: { color: '#fff', fontWeight: '900', fontSize: 12 },
  rotateBtn: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    backgroundColor: '#00d4ff',
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rotateTxt: { fontSize: 14 },
  convertBtn: {
    marginTop: 24,
    width: '100%',
    backgroundColor: '#2563eb',
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
  },
  convertBtnDisabled: { backgroundColor: '#334155', opacity: 0.6 },
  convertTxt: { color: '#fff', fontSize: 16, fontWeight: '900' },
  footer: { marginTop: 40, alignItems: 'center', paddingBottom: 20 },
  footerName: { color: '#fff', fontSize: 18, fontWeight: '900' },
  footerSub: { color: '#94a3b8', fontSize: 11, marginTop: 2, letterSpacing: 1 },
});
