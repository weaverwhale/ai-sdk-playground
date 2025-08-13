import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import './index.css';

interface ToolOutputProps {
  output: string;
  toolName: string;
}

export const ToolOutput: React.FC<ToolOutputProps> = ({ output, toolName }) => {
  // Helper function to parse JSON output safely
  const parseToolOutput = (output: string) => {
    try {
      return JSON.parse(output);
    } catch {
      return null;
    }
  };

  // Helper function to check if a string is a URL
  const isUrl = (str: string) => {
    try {
      new URL(str);
      return true;
    } catch {
      return false;
    }
  };

  // Helper function to check if URL points to an image
  const isImageUrl = (url: string) => {
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
    return imageExtensions.some((ext) => url.toLowerCase().includes(ext));
  };

  // Helper function to check if URL points to a video
  const isVideoUrl = (url: string) => {
    const videoExtensions = ['.mp4', '.mov', '.avi', '.webm', '.ogg'];
    return videoExtensions.some((ext) => url.toLowerCase().includes(ext));
  };

  // Helper function to check if output contains markdown content
  const isMarkdown = (str: string) => {
    // Check for common markdown patterns
    const markdownPatterns = [
      /^#{1,6}\s+.+$/m, // Headers
      /^\s*[-*+]\s+.+$/m, // Unordered lists
      /^\s*\d+\.\s+.+$/m, // Ordered lists
      /\*\*.*?\*\*/, // Bold text
      /\*.*?\*/, // Italic text
      /`.*?`/, // Inline code
      /```[\s\S]*?```/, // Code blocks
      /\[.*?\]\(.*?\)/, // Links
      /!\[.*?\]\(.*?\)/, // Images
      /^\s*>.*$/m, // Blockquotes
      /^\s*---+\s*$/m, // Horizontal rules
      /^\|.*\|.*$/m, // Tables
    ];

    return markdownPatterns.some((pattern) => pattern.test(str));
  };

  // Try to parse the output as JSON
  const parsedOutput = parseToolOutput(output);

  // Handle image generation tool output
  if (toolName === 'generateImage' && parsedOutput && parsedOutput.image) {
    const imageUrl = parsedOutput.image;
    return (
      <div className="tool-output">
        <div className="tool-section-label">Generated Image:</div>
        <div className="tool-media-container">
          <img
            src={imageUrl}
            alt="Generated image"
            className="tool-generated-image"
            onError={(e) => {
              console.error('Failed to load image:', imageUrl);
              e.currentTarget.style.display = 'none';
            }}
          />
          <div className="tool-media-info">
            <a
              href={imageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="tool-media-link"
            >
              Open in new tab
            </a>
          </div>
        </div>
      </div>
    );
  }

  // Handle video generation tool output
  if (
    toolName === 'generateVideo' &&
    parsedOutput &&
    parsedOutput.videos &&
    Array.isArray(parsedOutput.videos)
  ) {
    return (
      <div className="tool-output">
        <div className="tool-section-label">
          Generated Video{parsedOutput.videos.length > 1 ? 's' : ''}:
        </div>
        <div className="tool-media-container">
          {parsedOutput.videos.map((videoUrl: string, index: number) => (
            <div key={index} className="tool-video-item">
              <video
                src={videoUrl}
                className="tool-generated-video"
                controls
                preload="metadata"
                onError={(e) => {
                  console.error('Failed to load video:', videoUrl);
                  e.currentTarget.style.display = 'none';
                }}
              >
                Your browser does not support the video tag.
              </video>
              <div className="tool-media-info">
                <a
                  href={videoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="tool-media-link"
                >
                  Open in new tab
                </a>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Handle any other media URLs that might be in the output
  if (typeof output === 'string') {
    // Check if the output itself is a URL
    if (isUrl(output)) {
      if (isImageUrl(output)) {
        return (
          <div className="tool-output">
            <div className="tool-section-label">Output:</div>
            <div className="tool-media-container">
              <img
                src={output}
                alt="Tool output image"
                className="tool-generated-image"
                onError={(e) => {
                  console.error('Failed to load image:', output);
                  e.currentTarget.style.display = 'none';
                }}
              />
              <div className="tool-media-info">
                <a
                  href={output}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="tool-media-link"
                >
                  Open in new tab
                </a>
              </div>
            </div>
          </div>
        );
      }

      if (isVideoUrl(output)) {
        return (
          <div className="tool-output">
            <div className="tool-section-label">Output:</div>
            <div className="tool-media-container">
              <video
                src={output}
                className="tool-generated-video"
                controls
                preload="metadata"
                onError={(e) => {
                  console.error('Failed to load video:', output);
                  e.currentTarget.style.display = 'none';
                }}
              >
                Your browser does not support the video tag.
              </video>
              <div className="tool-media-info">
                <a
                  href={output}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="tool-media-link"
                >
                  Open in new tab
                </a>
              </div>
            </div>
          </div>
        );
      }
    }

    // Look for URLs within the text output
    const urlRegex = /(https?:\/\/[^\s]+|\/uploads\/[^\s]+)/g;
    const urls = output.match(urlRegex);

    if (urls && urls.length > 0) {
      const imageUrls = urls.filter(isImageUrl);
      const videoUrls = urls.filter(isVideoUrl);

      if (imageUrls.length > 0 || videoUrls.length > 0) {
        return (
          <div className="tool-output">
            <div className="tool-section-label">Output:</div>

            {imageUrls.length > 0 && (
              <div className="tool-media-container">
                <div className="tool-media-section-label">Images:</div>
                {imageUrls.map((imageUrl, index) => (
                  <div key={index} className="tool-image-item">
                    <img
                      src={imageUrl}
                      alt={`Output image ${index + 1}`}
                      className="tool-generated-image"
                      onError={(e) => {
                        console.error('Failed to load image:', imageUrl);
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                    <div className="tool-media-info">
                      <a
                        href={imageUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="tool-media-link"
                      >
                        Open in new tab
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {videoUrls.length > 0 && (
              <div className="tool-media-container">
                <div className="tool-media-section-label">Videos:</div>
                {videoUrls.map((videoUrl, index) => (
                  <div key={index} className="tool-video-item">
                    <video
                      src={videoUrl}
                      className="tool-generated-video"
                      controls
                      preload="metadata"
                      onError={(e) => {
                        console.error('Failed to load video:', videoUrl);
                        e.currentTarget.style.display = 'none';
                      }}
                    >
                      Your browser does not support the video tag.
                    </video>
                    <div className="tool-media-info">
                      <a
                        href={videoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="tool-media-link"
                      >
                        Open in new tab
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="tool-text-output">
              {isMarkdown(output) ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
                  {output}
                </ReactMarkdown>
              ) : (
                <p>{output}</p>
              )}
            </div>
          </div>
        );
      }
    }
  }

  // Default fallback - display as markdown if detected, otherwise as regular text
  return (
    <div className="tool-output">
      <div className="tool-section-label">Output:</div>
      {isMarkdown(output) ? (
        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
          {output}
        </ReactMarkdown>
      ) : (
        <p>{output}</p>
      )}
    </div>
  );
};
