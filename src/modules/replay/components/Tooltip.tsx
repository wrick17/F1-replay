import type { ReactElement } from "react";
import { Tooltip as Tippy } from "react-tippy";

type TooltipProps = {
  content: string;
  children: ReactElement;
};

export const Tooltip = ({ content, children }: TooltipProps) => {
  return (
    <Tippy
      title={content}
      position="top"
      trigger="mouseenter focus"
      arrow
      animation="shift"
      duration={150}
      distance={8}
    >
      {children}
    </Tippy>
  );
};
