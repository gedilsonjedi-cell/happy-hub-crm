import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import WebChatPublic from "@/pages/WebChatPublic";

const { invoke, startRecording, stopRecording, cancelRecording, recorderState, realtimeChannel } = vi.hoisted(() => {
  const channel: { on: ReturnType<typeof vi.fn>; subscribe: ReturnType<typeof vi.fn>; track: ReturnType<typeof vi.fn> } = {
    on: vi.fn(),
    subscribe: vi.fn(),
    track: vi.fn(),
  };
  channel.on.mockImplementation(() => channel);
  channel.subscribe.mockImplementation(() => channel);
  return {
    invoke: vi.fn(),
    startRecording: vi.fn(),
    stopRecording: vi.fn(),
    cancelRecording: vi.fn(),
    recorderState: { isRecording: false, recordingDuration: 0 },
    realtimeChannel: channel,
  };
});

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useParams: () => ({ linkId: "abc123" }) };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke },
    channel: vi.fn(() => realtimeChannel),
    removeChannel: vi.fn(),
  },
}));

vi.mock("@/hooks/useAudioRecording", () => ({
  useAudioRecording: () => ({ ...recorderState, startRecording, stopRecording, cancelRecording }),
}));

const inbound = {
  id: "inbound-1",
  content: "Olá, preciso de ajuda",
  direction: "inbound",
  sender_name: "Visitante",
  created_at: "2026-09-29T16:00:00.000Z",
  message_type: "text",
  status: "received",
};

const outbound = {
  id: "outbound-1",
  content: "Olá! Como posso ajudar?",
  direction: "outbound",
  sender_name: "Equipe Optimus",
  created_at: "2026-09-29T16:01:00.000Z",
  message_type: "text",
  status: "sent",
};

describe("Web Chat público", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    recorderState.isRecording = false;
    recorderState.recordingDuration = 0;
    localStorage.clear();
    window.scrollTo = vi.fn();
    Element.prototype.scrollIntoView = vi.fn();
    URL.createObjectURL = vi.fn(() => "blob:audio-preview");
    URL.revokeObjectURL = vi.fn();
    invoke.mockImplementation((name: string) => {
      if (name === "webchat-init") return Promise.resolve({ data: { link: { name: "Equipe Optimus", theme_color: "#00a884" }, messages: [outbound, inbound] }, error: null });
      return Promise.resolve({ data: { message: inbound }, error: null });
    });
    stopRecording.mockResolvedValue(new Blob(["voice"], { type: "audio/webm" }));
  });

  it("diferencia bolhas enviadas e recebidas e usa fundo com doodles", async () => {
    render(<WebChatPublic />);

    const history = await screen.findByTestId("webchat-history");
    expect(history).toHaveClass("webchat-doodles");
    expect(screen.getByText("Olá, preciso de ajuda").closest("[data-direction]"))
      .toHaveClass("webchat-bubble-sent");
    expect(screen.getByText("Olá! Como posso ajudar?").closest("[data-direction]"))
      .toHaveClass("webchat-bubble-received");
  });

  it("oferece somente emoji, microfone e texto, sem anexos", async () => {
    render(<WebChatPublic />);
    await screen.findByPlaceholderText("Digite uma mensagem");

    expect(screen.getByRole("button", { name: "Escolher emoji" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Gravar áudio" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Gravar áudio" })).toHaveClass("bg-webchat-green");
    expect(screen.queryByRole("button", { name: /anex/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/imagem|documento|vídeo/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Escolher emoji" }));
    fireEvent.click(await screen.findByRole("button", { name: "Inserir 😀" }));
    expect(screen.getByPlaceholderText("Digite uma mensagem")).toHaveValue("😀");
  });

  it("inicia, cancela e envia uma gravação de áudio", async () => {
    const view = render(<WebChatPublic />);
    fireEvent.click(await screen.findByRole("button", { name: "Gravar áudio" }));
    expect(startRecording).toHaveBeenCalledOnce();

    recorderState.isRecording = true;
    recorderState.recordingDuration = 4;
    view.rerender(<WebChatPublic />);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar gravação" }));
    expect(cancelRecording).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "Enviar áudio" }));
    await waitFor(() => expect(stopRecording).toHaveBeenCalledOnce());
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("webchat-send", expect.objectContaining({ body: expect.any(FormData) })));
  });

  it("mantém largura total no celular e painel amplo limitado no desktop", async () => {
    render(<WebChatPublic />);
    const shell = await screen.findByLabelText("Web Chat público");
    expect(shell).toHaveClass("w-full", "max-w-[100rem]");
    expect(screen.getByTestId("webchat-history")).toHaveClass("px-3", "sm:px-8", "lg:px-[8%]");
  });
});