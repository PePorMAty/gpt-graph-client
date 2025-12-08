export interface FlowPanelProps {
  onClose: () => void;
  isOpen: boolean;
  value: string;
  onChangeValue: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onDelete?: () => void;
  descriptionValue: string; // Добавляем значение описания
  onChangeDescription: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
}
