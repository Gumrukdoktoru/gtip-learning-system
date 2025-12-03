'use client';

import { useState } from 'react';
import { Training } from '@/types';
import { Plus, Trash2, Edit2, BookOpen, TrendingUp } from 'lucide-react';

interface TrainingTrackerProps {
  trainings: Training[];
  centerId: string;
  onAddTraining: (training: Omit<Training, 'id'>) => void;
  onUpdateTraining: (id: string, updates: Partial<Training>) => void;
  onDeleteTraining: (id: string) => void;
}

export default function TrainingTracker({ trainings, centerId, onAddTraining, onUpdateTraining, onDeleteTraining }: TrainingTrackerProps) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    studentName: '',
    courseName: '',
    startDate: '',
    endDate: '',
    status: 'planned' as Training['status'],
    progress: 0,
    notes: ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.studentName && formData.courseName && formData.startDate) {
      if (editingId) {
        onUpdateTraining(editingId, formData);
        setEditingId(null);
      } else {
        onAddTraining({
          centerId,
          ...formData
        });
      }
      resetForm();
    }
  };

  const resetForm = () => {
    setFormData({
      studentName: '',
      courseName: '',
      startDate: '',
      endDate: '',
      status: 'planned',
      progress: 0,
      notes: ''
    });
    setShowForm(false);
    setEditingId(null);
  };

  const handleEdit = (training: Training) => {
    setFormData({
      studentName: training.studentName,
      courseName: training.courseName,
      startDate: training.startDate,
      endDate: training.endDate || '',
      status: training.status,
      progress: training.progress,
      notes: training.notes || ''
    });
    setEditingId(training.id);
    setShowForm(true);
  };

  const centerTrainings = trainings.filter(t => t.centerId === centerId);
  const ongoingTrainings = centerTrainings.filter(t => t.status === 'ongoing');
  const plannedTrainings = centerTrainings.filter(t => t.status === 'planned');
  const completedTrainings = centerTrainings.filter(t => t.status === 'completed');

  const getStatusColor = (status: Training['status']) => {
    switch (status) {
      case 'planned': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      case 'ongoing': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
      case 'completed': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'cancelled': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
    }
  };

  const getStatusText = (status: Training['status']) => {
    switch (status) {
      case 'planned': return 'Planlandı';
      case 'ongoing': return 'Devam Ediyor';
      case 'completed': return 'Tamamlandı';
      case 'cancelled': return 'İptal Edildi';
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-bold flex items-center gap-2">
          <BookOpen size={24} />
          Eğitim Takibi
        </h3>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
        >
          <Plus size={20} />
          Yeni Eğitim
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Öğrenci Adı *</label>
              <input
                type="text"
                value={formData.studentName}
                onChange={(e) => setFormData({...formData, studentName: e.target.value})}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 dark:bg-gray-700"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Kurs Adı *</label>
              <input
                type="text"
                value={formData.courseName}
                onChange={(e) => setFormData({...formData, courseName: e.target.value})}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 dark:bg-gray-700"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Başlangıç Tarihi *</label>
              <input
                type="date"
                value={formData.startDate}
                onChange={(e) => setFormData({...formData, startDate: e.target.value})}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 dark:bg-gray-700"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Bitiş Tarihi</label>
              <input
                type="date"
                value={formData.endDate}
                onChange={(e) => setFormData({...formData, endDate: e.target.value})}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 dark:bg-gray-700"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Durum</label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({...formData, status: e.target.value as Training['status']})}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 dark:bg-gray-700"
              >
                <option value="planned">Planlandı</option>
                <option value="ongoing">Devam Ediyor</option>
                <option value="completed">Tamamlandı</option>
                <option value="cancelled">İptal Edildi</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">İlerleme (%{formData.progress})</label>
              <input
                type="range"
                min="0"
                max="100"
                value={formData.progress}
                onChange={(e) => setFormData({...formData, progress: parseInt(e.target.value)})}
                className="w-full"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Notlar</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({...formData, notes: e.target.value})}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 dark:bg-gray-700"
              rows={3}
              placeholder="Eğitim ile ilgili notlar..."
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600"
            >
              {editingId ? 'Güncelle' : 'Ekle'}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="px-4 py-2 bg-gray-300 dark:bg-gray-600 text-gray-800 dark:text-white rounded-lg hover:bg-gray-400 dark:hover:bg-gray-500"
            >
              İptal
            </button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
          <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{plannedTrainings.length}</div>
          <div className="text-sm text-gray-600 dark:text-gray-400">Planlanan</div>
        </div>
        <div className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-lg">
          <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{ongoingTrainings.length}</div>
          <div className="text-sm text-gray-600 dark:text-gray-400">Devam Eden</div>
        </div>
        <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
          <div className="text-2xl font-bold text-green-600 dark:text-green-400">{completedTrainings.length}</div>
          <div className="text-sm text-gray-600 dark:text-gray-400">Tamamlanan</div>
        </div>
      </div>

      <div className="space-y-3">
        {centerTrainings.length === 0 ? (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">
            <BookOpen size={48} className="mx-auto mb-4 opacity-50" />
            <p>Henüz eğitim kaydı yok</p>
            <p className="text-sm mt-2">Yukarıdaki &quot;Yeni Eğitim&quot; butonuna tıklayarak başlayın</p>
          </div>
        ) : (
          centerTrainings.map(training => (
            <div
              key={training.id}
              className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <h4 className="font-bold text-lg">{training.studentName}</h4>
                  <p className="text-gray-600 dark:text-gray-400">{training.courseName}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(training.status)}`}>
                    {getStatusText(training.status)}
                  </span>
                  <button
                    onClick={() => handleEdit(training)}
                    className="text-blue-500 hover:text-blue-700 transition-colors p-1"
                  >
                    <Edit2 size={18} />
                  </button>
                  <button
                    onClick={() => onDeleteTraining(training.id)}
                    className="text-red-500 hover:text-red-700 transition-colors p-1"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-gray-600 dark:text-gray-400">
                    {new Date(training.startDate).toLocaleDateString('tr-TR')}
                    {training.endDate && ` - ${new Date(training.endDate).toLocaleDateString('tr-TR')}`}
                  </span>
                  <span className="flex items-center gap-1 text-gray-600 dark:text-gray-400">
                    <TrendingUp size={14} />
                    %{training.progress}
                  </span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                  <div
                    className="bg-green-500 h-2 rounded-full transition-all"
                    style={{ width: `${training.progress}%` }}
                  />
                </div>
                {training.notes && (
                  <p className="text-gray-600 dark:text-gray-400 text-xs mt-2 italic">
                    {training.notes}
                  </p>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
