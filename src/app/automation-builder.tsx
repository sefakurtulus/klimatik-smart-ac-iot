import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Modal, Alert, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import DraggableFlatList, { RenderItemParams, ScaleDecorator } from 'react-native-draggable-flatlist';
import { Colors, Radius, Shadows, Spacing } from '@/constants/theme';
import { useAcStore, Scenario, ScenarioNode, AcMode, FanSpeed } from '@/store/useAcStore';

const generateId = () => Math.random().toString(36).substr(2, 9);

const DEFAULT_NODE: ScenarioNode = {
  id: '',
  stepOrder: 0,
  power: true,
  temp: 24,
  mode: 'Cool',
  fanSpeed: 'Auto',
  durationMinutes: 15
};

export default function AutomationBuilderScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const store = useAcStore();
  const theme = Colors[store.isDarkMode ? 'dark' : 'light'];

  const [name, setName] = useState('Yeni Otomasyon');
  const [icon, setIcon] = useState('home-automation');
  const [nodes, setNodes] = useState<ScenarioNode[]>([]);
  
  const [editingNode, setEditingNode] = useState<ScenarioNode | null>(null);
  const [isIconPickerVisible, setIconPickerVisible] = useState(false);

  const ICONS_LIST = [
    'home-automation', 'weather-sunny', 'weather-night', 'moon-waning-crescent', 
    'snowflake', 'fire', 'water-outline', 'fan', 'leaf', 
    'movie-open-outline', 'account-group-outline', 'bed-outline', 'coffee-outline'
  ];

  useEffect(() => {
    if (id && typeof id === 'string') {
      const existing = store.scenarios.find(s => s.id === id);
      if (existing) {
        setName(existing.name);
        setIcon(existing.icon);
        setNodes(JSON.parse(JSON.stringify(existing.nodes))); // deep copy
      }
    } else {
      // Add first default node
      handleAddNode();
    }
  }, [id]);

  const handleAddNode = () => {
    if (nodes.length >= 10) {
      Alert.alert('Limit Doldu', 'Maksimum 10 adım ekleyebilirsiniz.');
      return;
    }
    const newNode = { ...DEFAULT_NODE, id: generateId(), stepOrder: nodes.length + 1 };
    setNodes([...nodes, newNode]);
    setEditingNode(newNode);
  };

  const handleDuplicateNode = (nodeToCopy: ScenarioNode) => {
    if (nodes.length >= 10) {
      Alert.alert('Limit Doldu', 'Maksimum 10 adım ekleyebilirsiniz.');
      return;
    }
    const newNode = { ...nodeToCopy, id: generateId(), stepOrder: nodes.length + 1 };
    setNodes([...nodes, newNode]);
  };

  const handleRepeatSequence = () => {
    if (nodes.length === 0) return;
    const availableSlots = 10 - nodes.length;
    if (availableSlots <= 0) {
      Alert.alert('Limit Doldu', 'Maksimum 10 adım ekleyebilirsiniz.');
      return;
    }
    
    const currentSequence = [...nodes];
    const newNodes = [...nodes];
    
    let i = 0;
    while (newNodes.length < 10 && i < currentSequence.length * 10) {
      const nodeToCopy = currentSequence[i % currentSequence.length];
      newNodes.push({
        ...nodeToCopy,
        id: generateId(),
        stepOrder: newNodes.length + 1
      });
      i++;
    }
    
    setNodes(newNodes);
    Alert.alert('Başarılı', `Adımlar kopyalanarak döngü oluşturuldu. Toplam adım sayısı: ${newNodes.length}/10`);
  };

  const handleDeleteNode = (nodeId: string) => {
    const updated = nodes.filter(n => n.id !== nodeId).map((n, i) => ({ ...n, stepOrder: i + 1 }));
    setNodes(updated);
  };

  const handleSave = () => {
    if (nodes.length === 0) {
      Alert.alert('Hata', 'En az bir adım eklemelisiniz.');
      return;
    }
    const scenario: Scenario = {
      id: (id as string) || `sc_${generateId()}`,
      name,
      icon,
      createdAt: Date.now(),
      nodes
    };
    store.saveScenario(scenario);
    router.replace('/scenarios');
  };

  const saveEditingNode = () => {
    if (!editingNode) return;
    const updatedNodes = nodes.map(n => n.id === editingNode.id ? editingNode : n);
    setNodes(updatedNodes);
    setEditingNode(null);
  };

  const renderNode = ({ item: node, drag, isActive, getIndex }: RenderItemParams<ScenarioNode>) => {
    const index = getIndex() || 0;
    return (
      <ScaleDecorator>
        <View key={node.id} style={{ alignItems: 'center' }}>
          <TouchableOpacity 
            style={[styles.nodeCard, { backgroundColor: theme.backgroundElement, borderColor: isActive ? theme.primary : theme.border }]}
            onPress={() => setEditingNode({ ...node })}
            onLongPress={drag}
            delayLongPress={200}
          >
            <View style={[styles.nodeHeader, { borderBottomColor: theme.border }]}>
              <View style={[styles.nodeBadge, { backgroundColor: theme.primary }]}>
                <Text style={styles.nodeBadgeText}>{index + 1}</Text>
              </View>
              <Text style={[styles.nodeTitle, { color: theme.text }]}>
                {node.durationMinutes} Dakika
              </Text>
              <TouchableOpacity onPressIn={drag} style={{ padding: 4, marginRight: 8 }}>
                <MaterialCommunityIcons name="drag-horizontal-variant" size={24} color={theme.textSecondary} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleDuplicateNode(node)} style={{ padding: 4, marginRight: 8 }}>
                <MaterialCommunityIcons name="content-copy" size={20} color={theme.textSecondary} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleDeleteNode(node.id)} style={{ padding: 4 }}>
                <MaterialCommunityIcons name="trash-can-outline" size={20} color={theme.warn} />
              </TouchableOpacity>
            </View>
            
            <View style={styles.nodeContent}>
              {!node.power ? (
                <Text style={[styles.nodeStateText, { color: theme.textSecondary }]}>Klima Kapatılacak</Text>
              ) : (
                <Text style={[styles.nodeStateText, { color: theme.text }]}>
                  {node.temp}°C  •  {node.mode}  •  {node.fanSpeed} Fan
                </Text>
              )}
            </View>
          </TouchableOpacity>

          {/* Arrow Divider */}
          {index < nodes.length - 1 && (
            <View style={styles.arrowDivider}>
              <View style={[styles.arrowLine, { backgroundColor: theme.border }]} />
              <MaterialCommunityIcons name="arrow-down-circle" size={24} color={theme.primary} />
              <View style={[styles.arrowLine, { backgroundColor: theme.border }]} />
            </View>
          )}
        </View>
      </ScaleDecorator>
    );
  };

  const renderEditorModal = () => {
    if (!editingNode) return null;
    
    return (
      <Modal visible={!!editingNode} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.background, borderColor: theme.border }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Adım {editingNode.stepOrder} Ayarları</Text>
              <TouchableOpacity onPress={() => setEditingNode(null)}>
                <MaterialCommunityIcons name="close" size={24} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
                {/* Power Toggle */}
              <View style={styles.settingRow}>
                <Text style={[styles.settingLabel, { color: theme.text }]}>Güç Durumu</Text>
                <TouchableOpacity 
                  style={[styles.toggleBtn, { backgroundColor: editingNode.power ? theme.success : theme.border }]}
                  onPress={() => setEditingNode({...editingNode, power: !editingNode.power})}
                >
                  <Text style={{ color: '#FFF', fontWeight: 'bold' }}>{editingNode.power ? 'AÇIK' : 'KAPALI'}</Text>
                </TouchableOpacity>
              </View>

              {editingNode.power && (
                <>
                  {/* Temp */}
                  <View style={styles.settingRow}>
                    <Text style={[styles.settingLabel, { color: theme.text }]}>Sıcaklık</Text>
                    <View style={styles.stepper}>
                      <TouchableOpacity onPress={() => setEditingNode({...editingNode, temp: Math.max(17, editingNode.temp - 1)})}>
                        <MaterialCommunityIcons name="minus-circle-outline" size={32} color={theme.primary} />
                      </TouchableOpacity>
                      <Text style={[styles.stepperValue, { color: theme.text }]}>{editingNode.temp}°C</Text>
                      <TouchableOpacity onPress={() => setEditingNode({...editingNode, temp: Math.min(30, editingNode.temp + 1)})}>
                        <MaterialCommunityIcons name="plus-circle-outline" size={32} color={theme.primary} />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Mode */}
                  <Text style={[styles.settingLabel, { color: theme.text, marginTop: 16 }]}>Mod</Text>
                  <View style={styles.chipGroup}>
                    {(['Cool', 'Heat', 'Dry', 'Fan', 'Auto'] as AcMode[]).map(m => (
                      <TouchableOpacity 
                        key={m} 
                        style={[styles.chip, { backgroundColor: editingNode.mode === m ? theme.primary : theme.backgroundElement }]}
                        onPress={() => setEditingNode({...editingNode, mode: m})}
                      >
                        <Text style={{ color: editingNode.mode === m ? '#FFF' : theme.text }}>{m}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {/* Fan */}
                  <Text style={[styles.settingLabel, { color: theme.text, marginTop: 16 }]}>Fan Hızı</Text>
                  <View style={styles.chipGroup}>
                    {(['Auto', '1', '2', '3', 'Turbo'] as FanSpeed[]).map(f => (
                      <TouchableOpacity 
                        key={f} 
                        style={[styles.chip, { backgroundColor: editingNode.fanSpeed === f ? theme.primary : theme.backgroundElement }]}
                        onPress={() => setEditingNode({...editingNode, fanSpeed: f})}
                      >
                        <Text style={{ color: editingNode.fanSpeed === f ? '#FFF' : theme.text }}>{f}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}

              {/* Duration */}
              <View style={[styles.settingRow, { marginTop: 24, borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 24 }]}>
                <Text style={[styles.settingLabel, { color: theme.text }]}>Süre (Dakika)</Text>
                <View style={styles.stepper}>
                  <TouchableOpacity onPress={() => setEditingNode({...editingNode, durationMinutes: Math.max(1, editingNode.durationMinutes - 5)})}>
                    <MaterialCommunityIcons name="minus-box" size={36} color={theme.textSecondary} />
                  </TouchableOpacity>
                  <TextInput 
                    style={[styles.stepperInput, { color: theme.text }]}
                    keyboardType="numeric"
                    value={String(editingNode.durationMinutes)}
                    onChangeText={(val) => {
                      const num = parseInt(val, 10);
                      if (!isNaN(num)) setEditingNode({...editingNode, durationMinutes: num});
                      else if (val === '') setEditingNode({...editingNode, durationMinutes: 0});
                    }}
                  />
                  <TouchableOpacity onPress={() => setEditingNode({...editingNode, durationMinutes: editingNode.durationMinutes + 5})}>
                    <MaterialCommunityIcons name="plus-box" size={36} color={theme.textSecondary} />
                  </TouchableOpacity>
                </View>
              </View>

              </ScrollView>
            </KeyboardAvoidingView>

            <TouchableOpacity style={[styles.saveNodeBtn, { backgroundColor: theme.primary }]} onPress={saveEditingNode}>
              <Text style={styles.saveNodeBtnText}>Kaydet</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  };

  const renderIconPicker = () => {
    return (
      <Modal visible={isIconPickerVisible} animationType="fade" transparent={true}>
        <View style={[styles.modalOverlay, { justifyContent: 'center', alignItems: 'center' }]}>
          <View style={[styles.iconPickerModal, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            <Text style={{ color: theme.text, fontSize: 18, fontWeight: '700', marginBottom: 16 }}>İkon Seç</Text>
            <View style={styles.iconGrid}>
              {ICONS_LIST.map((icn) => (
                <TouchableOpacity 
                  key={icn} 
                  style={[styles.iconOption, { backgroundColor: icon === icn ? theme.primary : theme.background }]}
                  onPress={() => { setIcon(icn); setIconPickerVisible(false); }}
                >
                  <MaterialCommunityIcons name={icn as any} size={32} color={icon === icn ? '#FFF' : theme.text} />
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity 
              style={{ marginTop: 24, padding: 12, alignItems: 'center' }}
              onPress={() => setIconPickerVisible(false)}
            >
              <Text style={{ color: theme.textSecondary, fontWeight: '600' }}>İPTAL</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background, paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.replace('/scenarios')}>
          <MaterialCommunityIcons name="arrow-left" size={28} color={theme.text} />
        </TouchableOpacity>
        <Text style={{ color: theme.text, fontSize: 18, fontWeight: '700' }}>Otomasyon Düzenle</Text>
        <View style={{ width: 28 }} /> {/* Spacer to center the title */}
      </View>

      <DraggableFlatList
        data={nodes}
        onDragEnd={({ data }) => setNodes(data.map((n, i) => ({ ...n, stepOrder: i + 1 })))}
        keyExtractor={(item) => item.id}
        renderItem={renderNode}
        contentContainerStyle={styles.canvas}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={[styles.nameConfigContainer, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            <TouchableOpacity style={[styles.bigIconSelectBtn, { backgroundColor: `${theme.primary}15` }]} onPress={() => setIconPickerVisible(true)}>
              <MaterialCommunityIcons name={icon as any} size={36} color={theme.primary} />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.textSecondary, fontSize: 12, marginBottom: 4 }}>Otomasyon Adı</Text>
              <TextInput 
                style={[styles.bigNameInput, { color: theme.text, borderBottomColor: theme.border }]}
                value={name}
                onChangeText={setName}
                placeholder="Örn: Gece Soğutması"
                placeholderTextColor={theme.textSecondary}
              />
            </View>
          </View>
        }
        ListFooterComponent={
          <View>
            <TouchableOpacity 
              style={[styles.addBtn, { borderColor: theme.primary, backgroundColor: `${theme.primary}10` }]}
              onPress={handleAddNode}
            >
              <MaterialCommunityIcons name="plus" size={24} color={theme.primary} />
              <Text style={{ color: theme.primary, fontWeight: '600', marginLeft: 8 }}>Yeni Adım Ekle</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.addBtn, { borderColor: theme.primary, backgroundColor: `${theme.primary}10`, marginTop: 12 }]}
              onPress={handleRepeatSequence}
            >
              <MaterialCommunityIcons name="repeat" size={24} color={theme.primary} />
              <Text style={{ color: theme.primary, fontWeight: '600', marginLeft: 8 }}>Tüm Adımları Döngüye Al (Tekrarla)</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.mainSaveBtn, { backgroundColor: theme.primary }]}
              onPress={handleSave}
            >
              <MaterialCommunityIcons name="content-save-check" size={24} color="#FFF" />
              <Text style={styles.mainSaveBtnText}>SENARYOYU KAYDET</Text>
            </TouchableOpacity>
          </View>
        }
      />

      {renderEditorModal()}
      {renderIconPicker()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
  nameConfigContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: Radius.lg,
    borderWidth: 1,
    marginBottom: 24,
    ...Shadows.card
  },
  bigIconSelectBtn: {
    width: 64,
    height: 64,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  bigNameInput: {
    fontSize: 20,
    fontWeight: '700',
    borderBottomWidth: 1,
    paddingVertical: 8,
  },
  canvas: {
    padding: Spacing.four,
    paddingBottom: 140, // Increased to avoid navbar overlap
  },
  nodeCard: {
    width: '100%',
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: 16,
    ...Shadows.card,
  },
  nodeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    paddingBottom: 12,
    marginBottom: 12,
  },
  nodeBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  nodeBadgeText: {
    color: '#FFF',
    fontWeight: 'bold',
  },
  nodeTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
  },
  nodeContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  nodeStateText: {
    fontSize: 18,
    fontWeight: '500',
  },
  arrowDivider: {
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowLine: {
    width: 2,
    height: 12,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: Radius.lg,
    marginTop: 24,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    height: '75%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    padding: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  toggleBtn: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: Radius.full,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stepperValue: {
    fontSize: 24,
    fontWeight: '700',
  },
  stepperInput: {
    fontSize: 24,
    fontWeight: '700',
    width: 80,
    textAlign: 'center',
    paddingVertical: 0,
  },
  chipGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: Radius.full,
  },
  saveNodeBtn: {
    padding: 16,
    borderRadius: Radius.lg,
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 24,
  },
  saveNodeBtnText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  iconPickerModal: {
    width: '85%',
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: 24,
    ...Shadows.card
  },
  iconGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'center'
  },
  iconOption: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mainSaveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
    borderRadius: Radius.lg,
    marginTop: 32,
    marginBottom: 40,
    gap: 8,
    ...Shadows.floating,
  },
  mainSaveBtnText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '700',
  }
});
