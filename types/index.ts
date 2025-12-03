export interface TrainingCenter {
  id: string;
  name: string;
  color: string;
  icon: string;
}

export interface Todo {
  id: string;
  centerId: string;
  title: string;
  description?: string;
  completed: boolean;
  priority: 'low' | 'medium' | 'high';
  dueDate?: string;
  createdAt: string;
}

export interface Training {
  id: string;
  centerId: string;
  studentName: string;
  courseName: string;
  startDate: string;
  endDate?: string;
  status: 'planned' | 'ongoing' | 'completed' | 'cancelled';
  progress: number;
  notes?: string;
}

export const TRAINING_CENTERS: TrainingCenter[] = [
  {
    id: 'canli-7-24',
    name: "Can'lı 7/24 Eğitim Merkezi",
    color: 'bg-blue-500',
    icon: '🎓'
  },
  {
    id: 'egumruk',
    name: 'Eğümrük Eğitim',
    color: 'bg-green-500',
    icon: '📚'
  },
  {
    id: 'gumruk-kocu',
    name: 'Gümrük Koçu',
    color: 'bg-purple-500',
    icon: '🎯'
  }
];
