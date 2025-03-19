import React from 'react';

interface ToolIndicatorProps {
  toolName: string;
  isActive: boolean;
  description?: string;
}

export const ToolIndicator: React.FC<ToolIndicatorProps> = ({ 
  toolName, 
  isActive,
  description 
}) => {
  if (!isActive) return null;
  
  return (
    <div className="tool-indicator">
      <div className="tool-indicator-icon">
        <div className="tool-indicator-spinner"></div>
      </div>
      <div className="tool-indicator-content">
        <div className="tool-indicator-name">
          <span className="tool-indicator-label">Using tool:</span> {toolName}
        </div>
        {description && (
          <div className="tool-indicator-description">{description}</div>
        )}
      </div>
    </div>
  );
};

export default ToolIndicator; 