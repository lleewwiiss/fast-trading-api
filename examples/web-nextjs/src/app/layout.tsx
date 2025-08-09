export const metadata = {
  title: "Fast Trading API Integration Test",
  description: "Browser integration test for fast-trading-api",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          margin: 0,
          padding: "20px",
          backgroundColor: "#f5f5f5",
        }}
      >
        {children}
      </body>
    </html>
  );
}
