import * as cdk from "aws-cdk-lib";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import { Construct } from "constructs";
import { SSRWebsiteConstruct } from "../lib/ssr-website-construct";

export class MainStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    /**
     * Define a SSRWebsiteConstruct construct
     */
    const examplecom = new SSRWebsiteConstruct(this, "examplecom", {
      domainName: "example.com",
      certificate: acm.Certificate.fromCertificateArn(
        this,
        "ExampleComCertificate",
        "arn:aws:acm:us-east-1:123456789012:certificate/12345678-1234-1234-1234-123456789012"
      ),
    });
  }
}
