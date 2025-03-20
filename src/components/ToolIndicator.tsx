import React from 'react';

interface ToolIndicatorProps {
  name: string;
  isActive: boolean;
  description?: string;
}

const ToolIndicator: React.FC<ToolIndicatorProps> = ({ 
  name, 
  isActive,
  description 
}) => {
  if (!isActive) return null;
  
  return (
    <div className="tool-indicator">
      <div className="tool-indicator-spinner"></div>
      <div className="tool-indicator-content">
        <div className="tool-indicator-name">
          {name === "AI Tool" ? "Processing request..." : `Using ${name}`}
        </div>
        {description && <div className="tool-indicator-description">{description}</div>}
      </div>
    </div>
  );
};

export default ToolIndicator; 